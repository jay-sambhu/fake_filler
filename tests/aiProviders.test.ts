import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import {
  completePrompt,
  isAiConfigReady,
  listModels,
  loadAiSettings,
  testAiConnection,
  toAiConfig,
} from '../src/services/aiProviders';
import { classifyUnknownField } from '../src/services/aiClassifier';
import { clearClassificationCache } from '../src/services/classificationCache';
import { AiConfig } from '../src/types';

type Call = { url: string; init?: RequestInit };

function mockFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, statusText: '', json: async () => r.body } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const headersOf = (call: Call) => (call.init?.headers || {}) as Record<string, string>;
const bodyOf = (call: Call) => JSON.parse(String(call.init?.body || '{}'));

const config = (overrides: Partial<AiConfig>): AiConfig => ({
  enabled: true,
  provider: 'openai',
  apiKey: 'key-123',
  model: 'model-x',
  ...overrides,
});

// Minimal in-memory chrome.storage.local for the settings tests.
let store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
      set: async (values: Record<string, unknown>) => {
        Object.assign(store, values);
      },
      remove: async (keys: string | string[]) => {
        for (const k of ([] as string[]).concat(keys)) delete store[k];
      },
    },
  },
});

describe('AI providers', () => {
  beforeEach(async () => {
    store = {};
    await clearClassificationCache();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('listModels', () => {
    it('lists Gemini models that can generate text, without the models/ prefix', async () => {
      const { fn, calls } = mockFetch([
        {
          body: {
            models: [
              { name: 'models/gemini-a', displayName: 'Gemini A', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
            ],
          },
        },
      ]);
      const models = await listModels({ provider: 'gemini', apiKey: 'g-key' }, fn);
      expect(models).toEqual([{ id: 'gemini-a', name: 'Gemini A' }]);
      expect(calls[0].url).toContain('generativelanguage.googleapis.com/v1beta/models');
      expect(headersOf(calls[0])['x-goog-api-key']).toBe('g-key');
    });

    it('lists OpenAI chat models and drops speech, image and embedding models', async () => {
      const { fn, calls } = mockFetch([
        { body: { data: [{ id: 'gpt-x-mini' }, { id: 'whisper-1' }, { id: 'text-embedding-3-small' }, { id: 'gpt-image-1' }] } },
      ]);
      const models = await listModels({ provider: 'openai', apiKey: 'sk-1' }, fn);
      expect(models.map((m) => m.id)).toEqual(['gpt-x-mini']);
      expect(calls[0].url).toBe('https://api.openai.com/v1/models');
      expect(headersOf(calls[0]).Authorization).toBe('Bearer sk-1');
    });

    it('sends Anthropic headers and uses display names', async () => {
      const { fn, calls } = mockFetch([{ body: { data: [{ id: 'claude-x', display_name: 'Claude X' }] } }]);
      const models = await listModels({ provider: 'anthropic', apiKey: 'sk-ant' }, fn);
      expect(models).toEqual([{ id: 'claude-x', name: 'Claude X' }]);
      const h = headersOf(calls[0]);
      expect(h['x-api-key']).toBe('sk-ant');
      expect(h['anthropic-version']).toBe('2023-06-01');
      expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    });

    it('uses the custom server address and skips auth when no key is set', async () => {
      const { fn, calls } = mockFetch([{ body: { data: [{ id: 'llama3' }] } }]);
      await listModels({ provider: 'custom', apiKey: '', baseUrl: 'http://localhost:1234/v1/' }, fn);
      expect(calls[0].url).toBe('http://localhost:1234/v1/models');
      expect(headersOf(calls[0]).Authorization).toBeUndefined();
    });

    it('throws with the provider message on HTTP errors', async () => {
      const { fn } = mockFetch([{ status: 401, body: { error: { message: 'Incorrect API key' } } }]);
      await expect(listModels({ provider: 'openai', apiKey: 'bad' }, fn)).rejects.toMatchObject({ status: 401, message: 'Incorrect API key' });
    });
  });

  describe('completePrompt', () => {
    it('calls the OpenAI-compatible chat endpoint for Groq and OpenRouter', async () => {
      for (const [provider, url] of [
        ['groq', 'https://api.groq.com/openai/v1/chat/completions'],
        ['openrouter', 'https://openrouter.ai/api/v1/chat/completions'],
      ] as const) {
        const { fn, calls } = mockFetch([{ body: { choices: [{ message: { content: 'hi' } }] } }]);
        expect(await completePrompt(config({ provider }), 'ping', {}, fn)).toBe('hi');
        expect(calls[0].url).toBe(url);
        expect(bodyOf(calls[0])).toEqual({ model: 'model-x', messages: [{ role: 'user', content: 'ping' }] });
      }
    });

    it('reads text blocks from an Anthropic response', async () => {
      const { fn, calls } = mockFetch([{ body: { content: [{ type: 'text', text: '{"a":1}' }] } }]);
      expect(await completePrompt(config({ provider: 'anthropic' }), 'p', { maxTokens: 50 }, fn)).toBe('{"a":1}');
      expect(calls[0].url).toBe('https://api.anthropic.com/v1/messages');
      expect(bodyOf(calls[0]).max_tokens).toBe(50);
    });

    it('asks Gemini for JSON when requested', async () => {
      const { fn, calls } = mockFetch([{ body: { candidates: [{ content: { parts: [{ text: 'x' }] } }] } }]);
      await completePrompt(config({ provider: 'gemini' }), 'p', { json: true }, fn);
      expect(calls[0].url).toContain('/models/model-x:generateContent');
      expect(bodyOf(calls[0]).generationConfig.responseMimeType).toBe('application/json');
    });
  });

  describe('testAiConnection', () => {
    it('fails fast without a key or model', async () => {
      const { fn, calls } = mockFetch([{ body: {} }]);
      expect((await testAiConnection(config({ apiKey: ' ' }), fn)).status).toBe('invalid_key');
      expect((await testAiConnection(config({ model: '' }), fn)).status).toBe('model_not_found');
      expect(calls).toHaveLength(0);
    });

    it.each([
      [401, 'invalid_key'],
      [400, 'invalid_key', 'API key not valid'],
      [429, 'quota_exhausted'],
      [404, 'model_not_found'],
      [500, 'error'],
    ] as Array<[number, string, string?]>)('maps HTTP %i to %s', async (status, expected, message) => {
      const { fn } = mockFetch([{ status, body: { error: { message: message || 'nope' } } }]);
      const result = await testAiConnection(config({}), fn);
      expect(result.success).toBe(false);
      expect(result.status).toBe(expected);
    });

    it('reports success with the provider and model', async () => {
      const { fn } = mockFetch([{ body: { choices: [{ message: { content: 'OK' } }] } }]);
      const result = await testAiConnection(config({}), fn);
      expect(result.success).toBe(true);
      expect(result.message).toContain('OpenAI');
      expect(result.message).toContain('model-x');
    });

    it('reports network failures', async () => {
      const fn = (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch;
      expect((await testAiConnection(config({}), fn)).status).toBe('network_error');
    });
  });

  describe('settings', () => {
    it('migrates the v1.0.0 Gemini key and model', async () => {
      await chrome.storage.local.set({ geminiApiKey: 'old-key', geminiModel: 'old-model', geminiAiClassificationEnabled: true });
      const settings = await loadAiSettings();
      expect(settings.provider).toBe('gemini');
      expect(toAiConfig(settings)).toMatchObject({ enabled: true, provider: 'gemini', apiKey: 'old-key', model: 'old-model' });
    });

    it('keeps a separate key and model per provider', async () => {
      await chrome.storage.local.set({
        aiProvider: 'anthropic',
        aiApiKeys: { gemini: 'g', anthropic: 'a' },
        aiModels: { gemini: 'gm', anthropic: 'am' },
      });
      expect(toAiConfig(await loadAiSettings())).toMatchObject({ provider: 'anthropic', apiKey: 'a', model: 'am' });
    });

    it('treats a config as ready only with a model and a key (unless the provider needs none)', () => {
      expect(isAiConfigReady(config({}))).toBe(true);
      expect(isAiConfigReady(config({ model: '' }))).toBe(false);
      expect(isAiConfigReady(config({ apiKey: '' }))).toBe(false);
      expect(isAiConfigReady(config({ provider: 'custom', apiKey: '', baseUrl: 'http://localhost:11434/v1' }))).toBe(true);
    });
  });

  it('classifies a field through a non-Gemini provider and parses fenced JSON', async () => {
    const answer = '```json\n{"fieldType":"citizenshipNumber","confidence":0.9,"reasoning":"nagarikta"}\n```';
    const { fn, calls } = mockFetch([{ body: { content: [{ type: 'text', text: answer }] } }]);
    const result = await classifyUnknownField(
      { domain: 'example.gov.np', name: 'nagarikta_no' },
      config({ provider: 'anthropic', model: 'claude-x' }),
      fn
    );
    expect(result.fieldType).toBe('citizenshipNumber');
    expect(bodyOf(calls[0]).messages[0].content).toContain('nagarikta_no');
  });
});
