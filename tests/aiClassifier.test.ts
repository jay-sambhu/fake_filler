import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildClassificationPrompt,
  classifyUnknownField,
  normalizeFieldType,
  sanitizePayload,
  NEPALI_ADMINISTRATIVE_TOKENS,
} from '../src/services/aiClassifier';
import {
  clearClassificationCache,
  computeFieldHash,
  getCachedClassification,
  saveCachedClassification,
} from '../src/services/classificationCache';
import { AiConfig, FieldClassificationPayload } from '../src/types';

describe('AI Unknown Field Classifier & Caching Engine', () => {
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
    it('returns unknown immediately with 0 network calls when AI is disabled or unkeyed', async () => {
      let networkCalled = false;
      const mockFetch: typeof fetch = async () => {
        networkCalled = true;
        return {} as any;
      };

      const config: AiConfig = {
        provider: 'gemini',
        model: 'test-model',
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

      const config: AiConfig = {
        provider: 'gemini',
        model: 'test-model',
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

      const config: AiConfig = {
        provider: 'gemini',
        model: 'test-model',
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

      const config: AiConfig = {
        provider: 'gemini',
        model: 'test-model',
        apiKey: 'test-key-12345',
        enabled: true,
      };

      const result = await classifyUnknownField(payload, config, failingFetch);
      expect(result.fieldType).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Could not reach Google Gemini');
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

      const config: AiConfig = {
        provider: 'gemini',
        model: 'test-model',
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
});
