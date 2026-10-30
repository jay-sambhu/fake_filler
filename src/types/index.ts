export type Gender = 'Male' | 'Female' | 'Other';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-';
export type ProfileType = 'general' | 'student' | 'employee' | 'business' | 'teacher' | 'farmer';
export type FillScript = 'en' | 'np';

export interface DevanagariDetails {
  honorific: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  gender: string;
  province: string;
  district: string;
  municipality: string;
  ward: string;
  tole: string;
  fullAddress: string;

  // Permanent Address in Devanagari
  permanentProvince?: string;
  permanentDistrict?: string;
  permanentMunicipality?: string;
  permanentWard?: string;
  permanentTole?: string;
  permanentFullAddress?: string;

  // Temporary / Current Address in Devanagari
  tempProvince?: string;
  tempDistrict?: string;
  tempMunicipality?: string;
  tempWard?: string;
  tempTole?: string;
  tempFullAddress?: string;
  currentProvince?: string;
  currentDistrict?: string;
  currentMunicipality?: string;
  currentWard?: string;
  currentTole?: string;
  currentFullAddress?: string;

  occupation: string;
  jobTitle: string;
  department: string;
  companyName: string;
  designation?: string;
  businessName?: string;
  businessType?: string;
  school?: string;
  grade?: string;
  faculty?: string;
  guardianName?: string;
  cropType?: string;
  cooperative?: string;
  subject?: string;

  // Government & Official Document Identifiers in Devanagari
  citizenshipNumber?: string;
  citizenshipIssueDistrict?: string;
  citizenshipIssueDateBS?: string;
  citizenshipIssuedBy?: string;
  nationalId?: string;
  passportNumber?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  passportIssuedBy?: string;
  drivingLicenseNumber?: string;
  drivingLicenseCategory?: string;
  drivingLicenseIssueDate?: string;
  drivingLicenseExpiryDate?: string;

  // FinTech, Banking & Digital Wallets in Devanagari
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  esewaId?: string;
  khaltiId?: string;

  // Medical & Personal
  bloodGroup?: string;
}

export interface NepalAddress {
  province: string;
  district: string;
  municipality: string;
  municipalityType: 'Metropolitan City' | 'Sub-Metropolitan City' | 'Municipality' | 'Rural Municipality';
  ward: number;
  tole: string;
  fullAddress: string;
}

export interface SyntheticPerson {
  profileType: ProfileType;
  honorific: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  fullName: string;
  gender: Gender;
  dateOfBirth: string; // YYYY-MM-DD
  age: number;
  phone: string;       // 98XXXXXXXX / 97XXXXXXXX
  telephone: string;   // Local area code + XXXXXX
  email: string;       // name.surnameXX@example.test
  address: NepalAddress;
  permanentAddress?: NepalAddress;
  temporaryAddress?: NepalAddress;
  currentAddress?: NepalAddress;
  occupation: string;
  jobTitle: string;
  department: string;
  companyName: string;
  username: string;
  password: string;

  // Devanagari (नेपाली युनिकोड) localized attributes
  devanagari?: DevanagariDetails;

  // Archetype-specific attributes
  studentId?: string;
  school?: string;
  grade?: string;
  guardianName?: string;
  guardianPhone?: string;

  employeeId?: string;
  workEmail?: string;
  panNumber?: string;
  designation?: string;
  salary?: string;

  businessName?: string;
  businessType?: string;
  vatNumber?: string;
  registeredAddress?: string;

  subject?: string;
  faculty?: string;

  cooperative?: string;
  cropType?: string;
  dateOfBirthBS?: string; // e.g. 2058-04-12 (BS)
  citizenshipNumber?: string;
  citizenshipIssueDistrict?: string;
  citizenshipIssueDateBS?: string;
  citizenshipIssuedBy?: string;
  nationalId?: string;
  passportNumber?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  passportIssuedBy?: string;
  drivingLicenseNumber?: string;
  drivingLicenseCategory?: string;
  drivingLicenseIssueDate?: string;
  drivingLicenseExpiryDate?: string;

  // FinTech, Banking & Digital Wallets
  bankName?: string;
  bankBranch?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  esewaId?: string;
  khaltiId?: string;

  // Medical & Personal
  bloodGroup?: BloodGroup;
}

export type SupportedFieldType =
  | 'fullName'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'gender'
  | 'bloodGroup'
  | 'dateOfBirth'
  | 'dateOfBirthBS'
  | 'dateBS'
  | 'bsYear'
  | 'bsMonth'
  | 'bsDay'
  | 'age'
  | 'citizenshipNumber'
  | 'citizenshipIssueDistrict'
  | 'citizenshipIssueDateBS'
  | 'citizenshipIssuedBy'
  | 'nationalId'
  | 'passportNumber'
  | 'passportIssueDate'
  | 'passportExpiryDate'
  | 'passportIssuedBy'
  | 'drivingLicenseNumber'
  | 'drivingLicenseCategory'
  | 'drivingLicenseIssueDate'
  | 'drivingLicenseExpiryDate'
  | 'bankName'
  | 'bankBranch'
  | 'bankAccountNumber'
  | 'bankAccountName'
  | 'esewaId'
  | 'khaltiId'
  | 'email'
  | 'phone'
  | 'telephone'
  | 'province'
  | 'permanentProvince'
  | 'temporaryProvince'
  | 'currentProvince'
  | 'district'
  | 'permanentDistrict'
  | 'temporaryDistrict'
  | 'currentDistrict'
  | 'municipality'
  | 'permanentMunicipality'
  | 'temporaryMunicipality'
  | 'currentMunicipality'
  | 'ward'
  | 'permanentWard'
  | 'temporaryWard'
  | 'currentWard'
  | 'tole'
  | 'permanentTole'
  | 'temporaryTole'
  | 'currentTole'
  | 'address'
  | 'permanentAddress'
  | 'temporaryAddress'
  | 'currentAddress'
  | 'sameAsPermanent'
  | 'occupation'
  | 'jobTitle'
  | 'department'
  | 'companyName'
  | 'username'
  | 'password'
  | 'studentId'
  | 'school'
  | 'grade'
  | 'guardianName'
  | 'guardianPhone'
  | 'employeeId'
  | 'panNumber'
  | 'vatNumber'
  | 'salary'
  | 'businessName'
  | 'businessType'
  | 'designation'
  | 'subject'
  | 'faculty'
  | 'cooperative'
  | 'cropType'
  | 'citizenshipNumber'
  | 'nationalId'
  | 'number'
  | 'date'
  | 'text'
  | 'textarea'
  | 'url'
  | 'referenceNumber'
  | 'unknown';

export interface DetectedField {
  element: HTMLElement;
  type: SupportedFieldType;
  confidence: number;
  label?: string;
  name?: string;
  id?: string;
  script?: FillScript;
  addressScope?: 'permanent' | 'temporary';
}

export interface FillOptions {
  profile: ProfileType;
  fillScript?: FillScript;
  script?: FillScript;
  fillCategories: {
    personal: boolean;
    contact: boolean;
    address: boolean;
    professional: boolean;
  };
  enableAiClassification?: boolean;
}

export interface FillResult {
  success: boolean;
  fieldsFilledCount: number;
  details: Array<{
    field: string;
    type: SupportedFieldType;
    value: string | boolean;
  }>;
  errors?: string[];
}

export type AiProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter' | 'groq' | 'custom';

/** The AI provider used to classify fields the built-in rules can't recognise. */
export interface AiConfig {
  enabled: boolean;
  provider: AiProviderId;
  apiKey: string;
  model: string;
  /** Only for the custom OpenAI-compatible provider. */
  baseUrl?: string;
}

export interface FieldClassificationPayload {
  domain: string;
  name?: string;
  id?: string;
  placeholder?: string;
  label?: string;
  type?: string;
}

export interface ClassificationResult {
  fieldType: SupportedFieldType;
  confidence: number;
  reasoning?: string;
  fromCache?: boolean;
}

export interface ClassificationCacheEntry {
  fieldType: SupportedFieldType;
  confidence: number;
  reasoning?: string;
  timestamp: number;
}

export interface PageFieldInspection {
  index: number;
  name?: string;
  id?: string;
  placeholder?: string;
  label?: string;
  type: string;
  detectedType: SupportedFieldType;
  confidence: number;
  source: 'domain_override' | 'heuristic' | 'ai_cached' | 'unmapped';
}

export interface PersonaPreset {
  id: string;
  name: string;
  description?: string;
  baseProfile: ProfileType;
  gender?: Gender | 'Random';
  preferredScript?: FillScript;
  province?: string;
  district?: string;
  municipality?: string;
  occupation?: string;
  jobTitle?: string;
  designation?: string;
  department?: string;
  companyName?: string;
  school?: string;
  faculty?: string;
  grade?: string;
  businessName?: string;
  businessType?: string;
  cropType?: string;
  cooperative?: string;
  bloodGroup?: BloodGroup;
  bankName?: string;
  emailDomain?: string;
  panNumber?: string;
  vatNumber?: string;
  isBuiltin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ExtensionSettings {
  defaultProfile: ProfileType;
  selectedPresetId?: string;
  autoFillOnLoad: boolean;
  enableAiClassification: boolean;
  theme: 'dark' | 'light' | 'system';
}

export interface FieldSnapshot {
  element: HTMLElement;
  type: 'input' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'aria-checkbox' | 'aria-radio';
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
  ariaChecked?: string | null;
}

export interface FormSnapshot {
  timestamp: number;
  fields: FieldSnapshot[];
}

export interface UndoResult {
  success: boolean;
  revertedCount: number;
  action: 'reverted' | 'cleared';
  details?: Array<{
    field: string;
    restoredValue: string | boolean | number;
  }>;
}

export type ExtensionMessage =
  | { action: 'SCAN_PAGE' }
  | { action: 'GET_PAGE_FIELDS' }
  | { action: 'FILL_PAGE'; person: SyntheticPerson; options: FillOptions }
  | { action: 'UNDO_FILL' }
  | { action: 'CLEAR_FORM' }
  | { action: 'GET_LAST_GENERATED_PERSON' }
  | { action: 'GET_SESSION_PERSONA' }
  | { action: 'SET_SESSION_PERSONA'; person: SyntheticPerson; options?: FillOptions }
  | { action: 'CLEAR_SESSION_PERSONA' }
  | { action: 'CLASSIFY_FIELD'; payload: FieldClassificationPayload }
  | { action: 'FRAME_FILLED'; count: number }
  | { action: 'PING' };


