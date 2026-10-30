import { AiConfig, ClassificationResult, FieldClassificationPayload, SupportedFieldType } from '../types';
import { getCachedClassification, saveCachedClassification } from './classificationCache';
import { completePrompt, describeAiError, getProvider, isAiConfigReady } from './aiProviders';

export const VALID_FIELD_TYPES: readonly SupportedFieldType[] = [
  'fullName',
  'firstName',
  'middleName',
  'lastName',
  'gender',
  'dateOfBirth',
  'dateOfBirthBS',
  'dateBS',
  'age',
  'bloodGroup',
  'email',
  'phone',
  'telephone',
  'province',
  'district',
  'municipality',
  'ward',
  'tole',
  'address',
  'permanentAddress',
  'temporaryAddress',
  'occupation',
  'jobTitle',
  'department',
  'companyName',
  'username',
  'password',
  'studentId',
  'school',
  'grade',
  'faculty',
  'guardianName',
  'guardianPhone',
  'employeeId',
  'salary',
  'panNumber',
  'vatNumber',
  'businessName',
  'businessType',
  'designation',
  'subject',
  'citizenshipNumber',
  'citizenshipIssueDistrict',
  'citizenshipIssueDateBS',
  'nationalId',
  'passportNumber',
  'drivingLicenseNumber',
  'bankName',
  'bankBranch',
  'bankAccountNumber',
  'bankAccountName',
  'esewaId',
  'khaltiId',
  'referenceNumber',
  'number',
  'date',
  'text',
  'textarea',
  'url',
  'unknown',
];

/**
 * Validates and sanitizes the outgoing payload so that ONLY minimal
 * form element metadata (name, id, placeholder, label, type, domain) is sent.
 * Absolutely no webpage content, cookies, tokens, or user data is included.
 */
export function sanitizePayload(raw: FieldClassificationPayload): FieldClassificationPayload {
  return {
    domain: (raw.domain || 'unknown').slice(0, 100),
    name: (raw.name || '').slice(0, 80),
    id: (raw.id || '').slice(0, 80),
    placeholder: (raw.placeholder || '').slice(0, 100),
    label: (raw.label || '').slice(0, 120),
    type: (raw.type || 'text').slice(0, 30),
  };
}

export interface AdministrativeTokenInfo {
  token: string;
  devanagari: string;
  meaning: string;
  recommendedTypes: readonly SupportedFieldType[];
}

/**
 * Common Nepali bureaucratic and administrative tokens with their standard context
 * to aid semantic understanding in governmental, civil, and banking forms.
 */
export const NEPALI_ADMINISTRATIVE_TOKENS: readonly AdministrativeTokenInfo[] = [
  {
    token: 'dastur',
    devanagari: 'दस्तुर',
    meaning: 'Fee, tariff, or administrative service charge',
    recommendedTypes: ['number'],
  },
  {
    token: 'dharauti',
    devanagari: 'धरौटी',
    meaning: 'Security deposit, bond, or collateral guarantee amount',
    recommendedTypes: ['number'],
  },
  {
    token: 'nikasa',
    devanagari: 'निकासा',
    meaning: 'Disbursement, budget release, or clearance authorization/voucher',
    recommendedTypes: ['number', 'referenceNumber'],
  },
  {
    token: 'marfat',
    devanagari: 'मार्फत',
    meaning: 'Care of (c/o), intermediary, guardian, or authorized representative',
    recommendedTypes: ['guardianName', 'fullName', 'text'],
  },
  {
    token: 'bujhaune',
    devanagari: 'बुझाउने',
    meaning: 'Submitter, payer, depositor, or person tendering documents/payment',
    recommendedTypes: ['fullName', 'text'],
  },
  {
    token: 'dastakhat',
    devanagari: 'दस्तखत',
    meaning: 'Signature, applicant signatory name, or verified signee',
    recommendedTypes: ['fullName', 'text'],
  },
  {
    token: 'kaifiyat',
    devanagari: 'कैफियत',
    meaning: 'Remarks, particulars, explanatory notes, comments, or observation',
    recommendedTypes: ['textarea', 'text'],
  },
];

/**
 * Builds the structured classification prompt sent to the AI provider.
 * Includes domain-specific Nepali bureaucratic and administrative terminology context
 * for enhanced classification accuracy on government and enterprise forms.
 */
export function buildClassificationPrompt(payload: FieldClassificationPayload): string {
  const allowedList = VALID_FIELD_TYPES.filter((t) => t !== 'unknown').join(', ');

  const vocabContext = NEPALI_ADMINISTRATIVE_TOKENS.map(
    (item) =>
      `- "${item.token}" / "${item.devanagari}": ${item.meaning} -> typically [${item.recommendedTypes.join(', ')}]`
  ).join('\n');

  return `You are a field classification engine for synthetic form filling in Nepal.
Your task is to classify an ambiguous or unknown web form input field into the single most accurate field category from this allowed list:
[${allowedList}].

Field Metadata:
- Host domain: "${payload.domain}"
- Input name: "${payload.name || ''}"
- Input ID: "${payload.id || ''}"
- Input placeholder: "${payload.placeholder || ''}"
- Input label / context: "${payload.label || ''}"
- HTML input type: "${payload.type || 'text'}"

Nepali Administrative & Bureaucratic Terminology Context:
Use the following domain vocabulary guide to accurately resolve Nepali government, civil, and banking form tokens:
${vocabContext}
- "darta" / "दर्ता" or "chalani" / "चलानी": Registration, dispatch, or file docket -> classify as "referenceNumber".
- "nagrikta" / "नागरिकता": Citizenship number -> classify as "citizenshipNumber".
- "rastriya parichayapatra" / "राष्ट्रिय परिचयपत्र": National Identity Card -> classify as "nationalId".

Instructions:
1. Choose the single best matching type from the allowed list. If none match or you cannot determine it with reasonable confidence, return "unknown".
2. If the field is a reference code, transaction ID, customer ID, or application docket, classify it as "referenceNumber".
3. If the field represents payment fee or deposit amount (e.g. dastur, dharauti), classify as "number".
4. If the field represents notes, remarks, or explanatory text (e.g. kaifiyat, bibaran), classify as "textarea" or "text".
5. If the field represents an applicant submitter, signatory, or payer (e.g. bujhaune, dastakhat), classify as "fullName".
6. If the field represents an intermediary or care-of entity (e.g. marfat), classify as "guardianName" or "fullName".
7. Return strictly a JSON object with this exact shape:
{
  "fieldType": "<one of the allowed types>",
  "confidence": <float between 0.0 and 1.0>,
  "reasoning": "<brief 1-sentence reason referencing domain context if applicable>"
}`;
}

/**
 * Normalizes a raw string response into a valid SupportedFieldType.
 */
export function normalizeFieldType(rawType?: string): SupportedFieldType {
  if (!rawType) return 'unknown';
  const clean = rawType.trim();

  // Direct match
  if (VALID_FIELD_TYPES.includes(clean as SupportedFieldType)) {
    return clean as SupportedFieldType;
  }

  // Common aliases
  const lower = clean.toLowerCase().replace(/[_\-\s]/g, '');
  if (lower.includes('customerreference') || lower.includes('reference') || lower.includes('tracking') || lower.includes('chalani') || lower.includes('darta')) {
    return 'referenceNumber';
  }
  if (lower.includes('citizen') || lower.includes('nagrikta')) {
    return 'citizenshipNumber';
  }
  if (lower.includes('nationalid') || lower.includes('nid') || lower.includes('parichaya')) {
    return 'nationalId';
  }
  if (lower.includes('dob') || lower.includes('birth')) {
    return 'dateOfBirth';
  }
  if (lower.includes('mobile') || lower.includes('cell')) {
    return 'phone';
  }
  if (lower.includes('kaifiyat') || lower.includes('remarks') || lower.includes('particulars')) {
    return 'textarea';
  }
  if (lower.includes('dastur') || lower.includes('dharauti') || lower.includes('tariff') || lower.includes('fee')) {
    return 'number';
  }
  if (lower.includes('bujhaune') || lower.includes('dastakhat') || lower.includes('signatory')) {
    return 'fullName';
  }
  if (lower.includes('marfat')) {
    return 'guardianName';
  }

  return 'unknown';
}

function parseJsonObject(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    // Models without a JSON mode often wrap the object in prose or a ```json fence.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

/**
 * Classifies an unknown form field with the user's chosen AI provider, with persistent
 * caching and strict privacy sanitization. Filling stays fully offline when AI assist is
 * off or not configured.
 */
export async function classifyUnknownField(
  rawPayload: FieldClassificationPayload,
  config: AiConfig,
  fetchFn: typeof fetch = fetch
): Promise<ClassificationResult> {
  const sanitized = sanitizePayload(rawPayload);

  // 1. Check local cache first (avoids repeated network calls)
  const cached = await getCachedClassification(sanitized);
  if (cached) {
    return cached;
  }

  // 2. Without a usable configuration, return unknown immediately without error
  if (!config.enabled || !isAiConfigReady(config)) {
    return {
      fieldType: 'unknown',
      confidence: 0,
      reasoning: 'AI classification is disabled or not configured.',
    };
  }

  const providerName = getProvider(config.provider).name;
  let text: string;
  try {
    text = await completePrompt(config, buildClassificationPrompt(sanitized), { json: true }, fetchFn);
  } catch (err) {
    const { message } = describeAiError(err, providerName, config.model);
    console.warn(`[Nepal Test Filler] AI classification failed: ${message}`);
    return { fieldType: 'unknown', confidence: 0, reasoning: message };
  }

  if (!text) {
    return { fieldType: 'unknown', confidence: 0, reasoning: 'Empty response from model' };
  }
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return { fieldType: 'unknown', confidence: 0, reasoning: 'Failed to parse JSON response' };
  }

  const detectedType = normalizeFieldType(parsed?.fieldType);
  const confidence = typeof parsed?.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.8;
  const result: ClassificationResult = {
    fieldType: detectedType,
    confidence,
    reasoning: parsed?.reasoning || `Classified via ${providerName}`,
  };

  // 3. Save to persistent cache if confidence is reasonable
  if (detectedType !== 'unknown' && confidence >= 0.5) {
    await saveCachedClassification(sanitized, result);
  }

  return result;
}
