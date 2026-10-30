import { AiConfig, AiProviderId } from '../types';

export interface AiProviderInfo {
  id: AiProviderId;
  name: string;
  /** Where users create a key; shown next to the key field. */
  keyUrl?: string;
  keyPlaceholder: string;
  /** Local servers (Ollama, LM Studio) usually run without a key. */
  keyOptional?: boolean;
  /** OpenAI-compatible endpoint root, without a trailing slash. */
  baseUrl?: string;
}

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'Paste your key from Google AI Studio',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyPlaceholder: 'sk-or-…',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'groq',
    name: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_…',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    keyPlaceholder: 'Optional for local servers',
    keyOptional: true,
  },
];

export const DEFAULT_AI_PROVIDER: AiProviderId = 'gemini';
export const DEFAULT_CUSTOM_BASE_URL = 'http://localhost:11434/v1';

/** Abort a request that has not answered within this window so a fill never hangs. */
export const AI_REQUEST_TIMEOUT_MS = 8000;
const MODEL_LIST_TIMEOUT_MS = 12000;

export function getProvider(id: string | undefined): AiProviderInfo {
  return AI_PROVIDERS.find((p) => p.id === id) || AI_PROVIDERS[0];
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && AI_PROVIDERS.some((p) => p.id === value);
}

/** True when the config has everything needed to send a request. */
export function isAiConfigReady(config: Pick<AiConfig, 'provider' | 'apiKey' | 'model' | 'baseUrl'>): boolean {
  const provider = getProvider(config.provider);
  if (!config.model?.trim()) return false;
  if (provider.id === 'custom' && !config.baseUrl?.trim()) return false;
  return provider.keyOptional || Boolean(config.apiKey?.trim());
}

// ── Storage ────────────────────────────────────────────────

// `geminiAiClassificationEnabled` keeps its v1.0.0 name; it is the on/off switch for every provider.
export const AI_STORAGE_KEYS = ['aiProvider', 'aiApiKeys', 'aiModels', 'aiCustomBaseUrl', 'geminiAiClassificationEnabled'] as const;
// Written by v1.0.0, which only supported Gemini.
const LEGACY_KEYS = ['geminiApiKey', 'geminiModel'] as const;

export interface StoredAiSettings {
  enabled: boolean;
  provider: AiProviderId;
  /** One key and one model per provider, so switching provider doesn't lose them. */
  apiKeys: Partial<Record<AiProviderId, string>>;
  models: Partial<Record<AiProviderId, string>>;
  customBaseUrl: string;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

export async function loadAiSettings(): Promise<StoredAiSettings> {
  const data =
    typeof chrome !== 'undefined' && chrome.storage?.local
      ? ((await chrome.storage.local.get([...AI_STORAGE_KEYS, ...LEGACY_KEYS])) as Record<string, unknown>)
      : {};

  const apiKeys = asStringRecord(data.aiApiKeys);
  const models = asStringRecord(data.aiModels);
  if (!apiKeys.gemini && typeof data.geminiApiKey === 'string' && data.geminiApiKey) apiKeys.gemini = data.geminiApiKey;
  if (!models.gemini && typeof data.geminiModel === 'string' && data.geminiModel) models.gemini = data.geminiModel;

  return {
    enabled: data.geminiAiClassificationEnabled === true,
    provider: isAiProviderId(data.aiProvider) ? data.aiProvider : DEFAULT_AI_PROVIDER,
    apiKeys,
    models,
    customBaseUrl: typeof data.aiCustomBaseUrl === 'string' && data.aiCustomBaseUrl ? data.aiCustomBaseUrl : DEFAULT_CUSTOM_BASE_URL,
  };
}

/** The config for the active provider. */
export function toAiConfig(settings: StoredAiSettings): AiConfig {
  return {
    enabled: settings.enabled,
    provider: settings.provider,
    apiKey: settings.apiKeys[settings.provider] || '',
    model: settings.models[settings.provider] || '',
    baseUrl: settings.provider === 'custom' ? settings.customBaseUrl : undefined,
  };
}

export async function loadAiConfig(): Promise<AiConfig> {
  return toAiConfig(await loadAiSettings());
}

// ── HTTP ───────────────────────────────────────────────────

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function openAiBase(config: Pick<AiConfig, 'provider' | 'baseUrl'>): string {
  return trimSlash(config.provider === 'custom' ? config.baseUrl || DEFAULT_CUSTOM_BASE_URL : getProvider(config.provider).baseUrl || '');
}

function authHeaders(config: Pick<AiConfig, 'provider' | 'apiKey'>): Record<string, string> {
  const key = (config.apiKey || '').trim();
  switch (config.provider) {
    case 'gemini':
      return { 'x-goog-api-key': key };
    case 'anthropic':
      return {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        // Required for requests that carry an extension/browser Origin header.
        'anthropic-dangerous-direct-browser-access': 'true',
      };
    default:
      return key ? { Authorization: `Bearer ${key}` } : {};
  }
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const err = body?.error;
    return String((typeof err === 'string' ? err : err?.message) || body?.message || response.statusText || '');
  } catch {
    return response.statusText || '';
  }
}

export interface AiModelOption {
  id: string;
  name: string;
}

// Model families that can't answer a text prompt (speech, images, embeddings, moderation).
const NON_CHAT_MODEL = /embed|tts|whisper|transcribe|audio|realtime|image|imagen|dall-e|veo|moderation|guard|aqa|search|computer-use|live/i;

/**
 * Fetches the models the user's key can use, straight from the provider, so the list is
 * never out of date.
 */
export async function listModels(
  config: Pick<AiConfig, 'provider' | 'apiKey' | 'baseUrl'>,
  fetchFn: typeof fetch = fetch
): Promise<AiModelOption[]> {
  let url: string;
  if (config.provider === 'gemini') url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000';
  else if (config.provider === 'anthropic') url = 'https://api.anthropic.com/v1/models?limit=1000';
  else url = `${openAiBase(config)}/models`;

  const response = await fetchFn(url, { headers: authHeaders(config), signal: timeoutSignal(MODEL_LIST_TIMEOUT_MS) });
  if (!response.ok) throw new AiRequestError(await readError(response), response.status);
  const body = await response.json();

  let models: AiModelOption[];
  if (config.provider === 'gemini') {
    models = (Array.isArray(body?.models) ? body.models : [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => ({ id: String(m.name).replace(/^models\//, ''), name: String(m.displayName || m.name) }));
  } else {
    models = (Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [])
      .filter((m: any) => typeof m?.id === 'string')
      .map((m: any) => ({ id: m.id, name: String(m.display_name || m.name || m.id) }));
  }

  const seen = new Set<string>();
  return models
    .filter((m) => !NON_CHAT_MODEL.test(m.id) && !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Sends one prompt and returns the model's text answer. */
export async function completePrompt(
  config: AiConfig,
  prompt: string,
  opts: { maxTokens?: number; json?: boolean; timeoutMs?: number } = {},
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const model = config.model.trim();
  const signal = timeoutSignal(opts.timeoutMs ?? AI_REQUEST_TIMEOUT_MS);
  const headers = { 'Content-Type': 'application/json', ...authHeaders(config) };
  let url: string;
  let body: Record<string, unknown>;

  if (config.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
      },
    };
  } else if (config.provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    body = { model, max_tokens: opts.maxTokens || 400, messages: [{ role: 'user', content: prompt }] };
  } else {
    // OpenAI-compatible. Temperature and token limits are left out on purpose: OpenAI's
    // reasoning models reject both, and the prompt is short.
    url = `${openAiBase(config)}/chat/completions`;
    body = { model, messages: [{ role: 'user', content: prompt }] };
  }

  const response = await fetchFn(url, { method: 'POST', headers, signal, body: JSON.stringify(body) });
  if (!response.ok) throw new AiRequestError(await readError(response), response.status);
  const data = await response.json();

  if (config.provider === 'gemini') {
    const parts = data?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('') : '';
  }
  if (config.provider === 'anthropic') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return blocks.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join('');
  }
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

export interface AiConnectionTestResult {
  success: boolean;
  status: 'valid' | 'invalid_key' | 'quota_exhausted' | 'model_not_found' | 'network_error' | 'error';
  message: string;
  latencyMs?: number;
}

export function describeAiError(err: unknown, providerName: string, model: string): Omit<AiConnectionTestResult, 'latencyMs'> {
  if (!(err instanceof AiRequestError)) {
    const detail = err instanceof Error ? err.message : String(err);
    return { success: false, status: 'network_error', message: `Could not reach ${providerName}: ${detail}` };
  }
  const detail = err.message ? `: ${err.message}` : '';
  const lower = err.message.toLowerCase();
  if (err.status === 401 || err.status === 403 || (err.status === 400 && /api[ _-]?key|invalid.*key|key.*invalid/.test(lower))) {
    return { success: false, status: 'invalid_key', message: `${providerName} rejected the API key${detail}` };
  }
  if (err.status === 429 || lower.includes('quota') || lower.includes('rate limit')) {
    return { success: false, status: 'quota_exhausted', message: `Quota or rate limit reached (HTTP 429)${detail}` };
  }
  if (err.status === 404 || lower.includes('not found') || lower.includes('does not exist')) {
    return { success: false, status: 'model_not_found', message: `Model "${model}" is not available for this key${detail}` };
  }
  return { success: false, status: 'error', message: `${providerName} error (HTTP ${err.status})${detail}` };
}

/** Sends a tiny prompt to check the key, the model and the quota in one go. */
export async function testAiConnection(config: AiConfig, fetchFn: typeof fetch = fetch): Promise<AiConnectionTestResult> {
  const provider = getProvider(config.provider);
  if (!provider.keyOptional && !config.apiKey.trim()) {
    return { success: false, status: 'invalid_key', message: `API key is missing. Add your ${provider.name} key first.` };
  }
  if (!config.model.trim()) {
    return { success: false, status: 'model_not_found', message: 'Choose a model first.' };
  }

  const started = Date.now();
  try {
    await completePrompt(config, 'Reply with the single word OK.', { maxTokens: 16, timeoutMs: 15000 }, fetchFn);
    const latencyMs = Date.now() - started;
    return { success: true, status: 'valid', message: `Connected to ${provider.name} with ${config.model} (${latencyMs} ms).`, latencyMs };
  } catch (err) {
    return { ...describeAiError(err, provider.name, config.model), latencyMs: Date.now() - started };
  }
}
