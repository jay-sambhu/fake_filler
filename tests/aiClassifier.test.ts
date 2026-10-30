import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildClassificationPrompt,
  classifyUnknownField,
  normalizeFieldType,
  sanitizePayload,
  testGeminiConnection,
  NEPALI_ADMINISTRATIVE_TOKENS,
  SUPPORTED_GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  FALLBACK_GEMINI_MODEL,
  resolveGeminiModel,
} from '../src/services/geminiClassifier';
import {
  clearClassificationCache,
  computeFieldHash,
  getCachedClassification,
  saveCachedClassification,
} from '../src/services/classificationCache';
import { FieldClassificationPayload, GeminiConfig } from '../src/types';

describe('Gemini Unknown Field Classifier & Caching Engine', () => {
  beforeEach(async () => {
    await clearClassificationCache();
  });

  describe('Privacy Sanitization & Hash Calculation', () => {
    it('sanitizes input payload to strictly allow only form metadata', () => {
      const payload: FieldClassificationPayload = {
        domain: 'https://service.gov.np/app?token=secret123',
        name: 'cust_ref_num',
        id: 'txtRef',
        placeholder: 'Enter Reference Number',
        label: 'Application Reference ID',
        type: 'text',
      };

      const sanitized = sanitizePayload(payload);
      expect(sanitized.name).toBe('cust_ref_num');
      expect(sanitized.id).toBe('txtRef');
      expect(sanitized.placeholder).toBe('Enter Reference Number');
      expect(sanitized.label).toBe('Application Reference ID');
      expect(sanitized.type).toBe('text');
      // Verify no extra secret fields can leak
      expect(Object.keys(sanitized).sort()).toEqual(['domain', 'id', 'label', 'name', 'placeholder', 'type']);
    });

    it('generates deterministic, normalized hash keys', () => {
      const p1: FieldClassificationPayload = {
        domain: 'esewa.com.np',
        name: 'CUSTOMER_ID ',
        id: 'cust_id',
        placeholder: 'Enter ID',
        label: 'Customer ID',
        type: 'TEXT',
      };

      const p2: FieldClassificationPayload = {
        domain: 'ESEWA.COM.NP ',
        name: 'customer_id',
        id: 'cust_id',
        placeholder: 'enter id',
        label: 'customer id',
        type: 'text',
      };

      expect(computeFieldHash(p1)).toBe(computeFieldHash(p2));
    });
  });

  describe('Prompt Generation & Schema Normalization', () => {
    it('constructs prompt instructing Gemini to return JSON with SupportedFieldType', () => {
      const prompt = buildClassificationPrompt({
        domain: 'nepalpost.gov.np',
        name: 'chalani_no',
        label: 'चलानी नं.',
      });

      expect(prompt).toContain('nepalpost.gov.np');
      expect(prompt).toContain('chalani_no');
      expect(prompt).toContain('चलानी नं.');
      expect(prompt).toContain('"fieldType"');
      expect(prompt).toContain('"confidence"');
      expect(prompt).toContain('referenceNumber');
    });

    it('normalizes valid types and common aliases', () => {
      expect(normalizeFieldType('fullName')).toBe('fullName');
      expect(normalizeFieldType('panNumber')).toBe('panNumber');
      expect(normalizeFieldType('citizenshipNumber')).toBe('citizenshipNumber');
      expect(normalizeFieldType('customerReference')).toBe('referenceNumber');
      expect(normalizeFieldType('tracking_reference')).toBe('referenceNumber');
      expect(normalizeFieldType('nagrikta_no')).toBe('citizenshipNumber');
      expect(normalizeFieldType('national_id_card')).toBe('nationalId');
      expect(normalizeFieldType('completely_unknown_xyz')).toBe('unknown');
    });
  });

  describe('Offline Boundaries & Cache Lookup', () => {
    it('returns unknown immediately with 0 network calls when Gemini is disabled or unkeyed', async () => {
      let networkCalled = false;
      const mockFetch: typeof fetch = async () => {
        networkCalled = true;
        return {} as any;
      };

      const config: GeminiConfig = {
        apiKey: '',
        enabled: false,
      };

      const result = await classifyUnknownField(
        { domain: 'test.np', name: 'cust_no' },
        config,
        mockFetch
      );

      expect(result.fieldType).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(networkCalled).toBe(false);
    });

    it('returns cached classification without calling network fetch', async () => {
      const payload: FieldClassificationPayload = {
        domain: 'khalti.com',
        name: 'utility_consumer_code',
        label: 'Consumer Code',
      };

      // Seed cache
      await saveCachedClassification(payload, {
        fieldType: 'referenceNumber',
        confidence: 0.95,
        reasoning: 'Utility bill consumer identifier',
      });

      let fetchInvoked = false;
      const mockFetch: typeof fetch = async () => {
        fetchInvoked = true;
        return {} as any;
      };

      const config: GeminiConfig = {
        apiKey: 'fake-api-key',
        enabled: true,
      };

      const result = await classifyUnknownField(payload, config, mockFetch);
      expect(fetchInvoked).toBe(false);
      expect(result.fromCache).toBe(true);
      expect(result.fieldType).toBe('referenceNumber');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Live API Response Handling & Fallback', () => {
    it('successfully processes structured JSON candidate response and saves to cache', async () => {
      const payload: FieldClassificationPayload = {
        domain: 'portal.nepal.gov.np',
        name: 'rastriya_parichaya_patra_no',
        label: 'राष्ट्रिय परिचयपत्र नम्बर',
      };

      const fakeResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    fieldType: 'nationalId',
                    confidence: 0.98,
                    reasoning: 'Nepali National Identity Card number',
                  }),
                },
              ],
            },
          },
        ],
      };

      const mockFetch: typeof fetch = async () =>
        ({
          ok: true,
          status: 200,
          json: async () => fakeResponse,
        } as any);

      const config: GeminiConfig = {
        apiKey: 'test-key-12345',
        enabled: true,
      };

      const result = await classifyUnknownField(payload, config, mockFetch);
      expect(result.fieldType).toBe('nationalId');
      expect(result.confidence).toBe(0.98);

      // Verify it was persisted to cache
      const cached = await getCachedClassification(payload);
      expect(cached?.fieldType).toBe('nationalId');
      expect(cached?.fromCache).toBe(true);
    });

    it('gracefully handles HTTP errors and network failure without throwing', async () => {
      const payload: FieldClassificationPayload = {
        domain: 'example.com',
        name: 'random_field_xyz',
      };

      const failingFetch: typeof fetch = async () => {
        throw new Error('Network offline or ECONNREFUSED');
      };

      const config: GeminiConfig = {
        apiKey: 'test-key-12345',
        enabled: true,
      };

      const result = await classifyUnknownField(payload, config, failingFetch);
      expect(result.fieldType).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Network or fetch exception');
    });
  });

  describe('Phase 3.1 — Gemini Test Connection & Instant Validation', () => {
    it('fails fast if API key is empty or whitespace without calling fetch', async () => {
      let fetchCalled = false;
      const mockFetch: typeof fetch = async () => {
        fetchCalled = true;
        return {} as any;
      };

      const result = await testGeminiConnection('   ', 'gemini-3.5-flash-lite', mockFetch);
      expect(fetchCalled).toBe(false);
      expect(result.success).toBe(false);
      expect(result.status).toBe('invalid_key');
      expect(result.message).toContain('API key is missing');
    });

    it('verifies valid connection with latency when API returns 200 OK', async () => {
      let requestedUrl = '';
      let requestBody: any = null;

      let requestHeaders: Record<string, string> = {};
      const mockFetch: typeof fetch = async (url, init) => {
        requestedUrl = String(url);
        requestHeaders = (init?.headers || {}) as Record<string, string>;
        requestBody = JSON.parse(String(init?.body || '{}'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'pong' }],
                },
              },
            ],
          }),
        } as any;
      };

      const result = await testGeminiConnection('valid-test-key-123', 'gemini-3.5-flash-lite', mockFetch);
      expect(requestedUrl).toContain('models/gemini-3.5-flash-lite:generateContent');
      // The key travels in a header, never in the URL (URLs end up in logs and history)
      expect(requestedUrl).not.toContain('valid-test-key-123');
      expect(requestHeaders['x-goog-api-key']).toBe('valid-test-key-123');
      expect(requestBody.contents[0].parts[0].text).toBe('ping');
      expect(result.success).toBe(true);
      expect(result.status).toBe('valid');
      expect(result.message).toContain('Connection verified');
      expect(typeof result.latencyMs).toBe('number');
      expect(result.model).toBe('gemini-3.5-flash-lite');
    });

    it('handles HTTP 400 with invalid API key response', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: 400,
              message: 'API key not valid. Please pass a valid API key.',
              status: 'INVALID_ARGUMENT',
            },
          }),
        } as any);

      const result = await testGeminiConnection('bad-key', 'gemini-3.5-flash-lite', mockFetch);
      expect(result.success).toBe(false);
      expect(result.status).toBe('invalid_key');
      expect(result.message).toContain('Invalid API key');
      expect(result.message).toContain('API key not valid');
    });

    it('handles HTTP 403 permission denied', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 403,
          json: async () => ({
            error: {
              code: 403,
              message: 'Method doesn\'t allow unregistered callers.',
              status: 'PERMISSION_DENIED',
            },
          }),
        } as any);

      const result = await testGeminiConnection('unauthorized-key', 'gemini-3.5-flash-lite', mockFetch);
      expect(result.success).toBe(false);
      expect(result.status).toBe('invalid_key');
      expect(result.message).toContain('Invalid API key');
    });

    it('handles HTTP 429 quota exhaustion with specific quota message', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 429,
          json: async () => ({
            error: {
              code: 429,
              message: 'Resource has been exhausted (e.g. check quota).',
              status: 'RESOURCE_EXHAUSTED',
            },
          }),
        } as any);

      const result = await testGeminiConnection('exhausted-key', 'gemini-3.5-flash-lite', mockFetch);
      expect(result.success).toBe(false);
      expect(result.status).toBe('quota_exhausted');
      expect(result.message).toContain('Quota exceeded (HTTP 429)');
      expect(result.message).toContain('Resource has been exhausted');
    });

    it('handles HTTP 404 when model is unavailable or misspelled', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 404,
          json: async () => ({
            error: {
              code: 404,
              message: 'models/non-existent-model is not found.',
              status: 'NOT_FOUND',
            },
          }),
        } as any);

      const result = await testGeminiConnection('some-key', 'non-existent-model', mockFetch);
      expect(result.success).toBe(false);
      expect(result.status).toBe('model_not_found');
      expect(result.message).toContain("Model 'non-existent-model' was not found");
    });

    it('handles general unexpected HTTP errors like 500 server error', async () => {
      const mockFetch: typeof fetch = async () =>
        ({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({
            error: {
              code: 500,
              message: 'Internal server error occurred.',
            },
          }),
        } as any);

      const result = await testGeminiConnection('valid-key', 'gemini-3.5-flash-lite', mockFetch);
      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.message).toContain('Gemini API error (HTTP 500)');
    });

    it('handles offline network exceptions gracefully', async () => {
      const failingFetch: typeof fetch = async () => {
        throw new TypeError('Failed to fetch: DNS resolution failed');
      };

      const result = await testGeminiConnection('valid-key', 'gemini-3.5-flash-lite', failingFetch);
      expect(result.success).toBe(false);
      expect(result.status).toBe('network_error');
      expect(result.message).toContain('Network error: Unable to connect to Gemini API');
    });
  });

  describe('Phase 3.2 — Nepali Administrative Prompt Context & Domain Vocabulary', () => {
    const requiredTokens = [
      'dastur',
      'dharauti',
      'nikasa',
      'marfat',
      'bujhaune',
      'dastakhat',
      'kaifiyat',
    ] as const;

    it('contains all 7 mandated Nepali administrative tokens with Devanagari script and definitions', () => {
      const definedTokens = NEPALI_ADMINISTRATIVE_TOKENS.map((t) => t.token);

      for (const required of requiredTokens) {
        expect(definedTokens).toContain(required);
        const item = NEPALI_ADMINISTRATIVE_TOKENS.find((t) => t.token === required);
        expect(item).toBeDefined();
        expect(item?.devanagari.length).toBeGreaterThan(0);
        expect(item?.meaning.length).toBeGreaterThan(0);
        expect(item?.recommendedTypes.length).toBeGreaterThan(0);
      }
    });

    it('injects all bureaucratic domain vocabulary tokens and Devanagari into Gemini prompt', () => {
      const prompt = buildClassificationPrompt({
        domain: 'nagarik.gov.np',
        name: 'dharauti_rakam',
        label: 'धरौटी रकम',
      });

      // Verify each token and its Devanagari counterpart are present in the prompt
      for (const token of requiredTokens) {
        expect(prompt).toContain(token);
      }

      expect(prompt).toContain('दस्तुर');
      expect(prompt).toContain('धरौटी');
      expect(prompt).toContain('निकासा');
      expect(prompt).toContain('मार्फत');
      expect(prompt).toContain('बुझाउने');
      expect(prompt).toContain('दस्तखत');
      expect(prompt).toContain('कैफियत');

      // Verify domain metadata is integrated
      expect(prompt).toContain('nagarik.gov.np');
      expect(prompt).toContain('dharauti_rakam');
      expect(prompt).toContain('धरौटी रकम');
    });

    it('normalizes bureaucratic domain tokens and common aliases accurately', () => {
      // Fee / Deposit -> number
      expect(normalizeFieldType('dastur')).toBe('number');
      expect(normalizeFieldType('dastur_fee')).toBe('number');
      expect(normalizeFieldType('dharauti')).toBe('number');
      expect(normalizeFieldType('dharauti_amount')).toBe('number');

      // Remarks -> textarea
      expect(normalizeFieldType('kaifiyat')).toBe('textarea');
      expect(normalizeFieldType('kaifiyat_bibaran')).toBe('textarea');
      expect(normalizeFieldType('remarks_notes')).toBe('textarea');

      // Submitter / Signatory -> fullName
      expect(normalizeFieldType('bujhaune')).toBe('fullName');
      expect(normalizeFieldType('bujhaune_ko_naam')).toBe('fullName');
      expect(normalizeFieldType('dastakhat')).toBe('fullName');
      expect(normalizeFieldType('authorized_signatory')).toBe('fullName');

      // Care of / Intermediary -> guardianName
      expect(normalizeFieldType('marfat')).toBe('guardianName');
      expect(normalizeFieldType('samrakshak_marfat')).toBe('guardianName');
    });

    it('successfully classifies an administrative field end-to-end with injected vocabulary', async () => {
      const payload: FieldClassificationPayload = {
        domain: 'ird.gov.np',
        name: 'dastur_bujhaune_person',
        label: 'दस्तुर बुझाउने व्यक्ति',
      };

      const fakeResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    fieldType: 'fullName',
                    confidence: 0.95,
                    reasoning: 'Field represents bujhaune (person submitting payment)',
                  }),
                },
              ],
            },
          },
        ],
      };

      let sentPrompt = '';
      const mockFetch: typeof fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        sentPrompt = body.contents[0].parts[0].text;
        return {
          ok: true,
          status: 200,
          json: async () => fakeResponse,
        } as any;
      };

      const config: GeminiConfig = {
        apiKey: 'test-admin-key',
        enabled: true,
      };

      const result = await classifyUnknownField(payload, config, mockFetch);
      expect(sentPrompt).toContain('bujhaune');
      expect(sentPrompt).toContain('बुझाउने');
      expect(sentPrompt).toContain('dastur');
      expect(result.fieldType).toBe('fullName');
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toContain('bujhaune');
    });
  });

  describe('Phase 3.3 — Dynamic Model Selector & Fallback Engine', () => {
    it('defines supported model options with required models and fallback metadata', () => {
      const modelIds = SUPPORTED_GEMINI_MODELS.map((m) => m.id);
      expect(modelIds).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash']);
      // Retired models must not be offered
      expect(modelIds).not.toContain('gemini-1.5-flash');

      expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
      expect(FALLBACK_GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    });

    it('resolves valid models accurately with trimming and case insensitivity', () => {
      expect(resolveGeminiModel('gemini-3.8-flash')).toBe('gemini-3.8-flash');
      expect(resolveGeminiModel('gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite');
      expect(resolveGeminiModel('  GEMINI-3.8-FLASH  ')).toBe('gemini-3.8-flash');
      // Models stored by older versions resolve to the default
      expect(resolveGeminiModel('gemini-1.5-flash')).toBe('gemini-3.5-flash-lite');
      expect(resolveGeminiModel('gemini-2.5-pro')).toBe('gemini-3.5-flash-lite');
    });

    it('falls back to gemini-3.5-flash-lite on unknown, empty, or undefined models', () => {
      expect(resolveGeminiModel(undefined)).toBe('gemini-3.5-flash-lite');
      expect(resolveGeminiModel('')).toBe('gemini-3.5-flash-lite');
      expect(resolveGeminiModel('   ')).toBe('gemini-3.5-flash-lite');
      expect(resolveGeminiModel('non-existent-gpt-model')).toBe('gemini-3.5-flash-lite');
    });

    it('automatically retries with gemini-3.5-flash-lite if selected model returns 404', async () => {
      const payload: FieldClassificationPayload = {
        domain: 'gov.np',
        name: 'chalani_karyalaya',
      };

      const requestedUrls: string[] = [];

      const mockFetch: typeof fetch = async (url) => {
        const urlStr = String(url);
        requestedUrls.push(urlStr);

        // First attempt with gemini-3.8-flash fails with 404
        if (urlStr.includes('gemini-3.8-flash')) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: { code: 404, message: 'Model not found' } }),
          } as any;
        }

        // Fallback attempt with gemini-3.5-flash-lite succeeds with 200
        if (urlStr.includes('gemini-3.5-flash-lite')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          fieldType: 'referenceNumber',
                          confidence: 0.9,
                          reasoning: 'Classified using fallback model',
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          } as any;
        }

        return { ok: false, status: 500 } as any;
      };

      const config: GeminiConfig = {
        apiKey: 'test-key',
        enabled: true,
        model: 'gemini-3.8-flash',
      };

      const result = await classifyUnknownField(payload, config, mockFetch);
      expect(requestedUrls.length).toBe(2);
      expect(requestedUrls[0]).toContain('gemini-3.8-flash');
      expect(requestedUrls[1]).toContain('gemini-3.5-flash-lite');
      expect(result.fieldType).toBe('referenceNumber');
      expect(result.confidence).toBe(0.9);
    });

    it('testGeminiConnection reports a missing model clearly', async () => {
      let testedUrl = '';
      const mockFetch: typeof fetch = async (url) => {
        testedUrl = String(url);
        return {
          ok: false,
          status: 404,
          json: async () => ({
            error: {
              code: 404,
              message: 'Model gemini-3.8-flash not found in region',
              status: 'NOT_FOUND',
            },
          }),
        } as any;
      };

      const result = await testGeminiConnection('test-key-xyz', 'gemini-3.8-flash', mockFetch);
      expect(testedUrl).toContain('models/gemini-3.8-flash:generateContent');
      expect(result.success).toBe(false);
      expect(result.status).toBe('model_not_found');
      expect(result.message).toContain('gemini-3.8-flash');
    });
  });
});
