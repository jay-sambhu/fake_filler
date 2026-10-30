import {
  ClassificationResult,
  DetectedField,
  FieldClassificationPayload,
  FieldSnapshot,
  FillOptions,
  FillResult,
  FillScript,
  FormSnapshot,
  AiConfig,
  PageFieldInspection,
  SupportedFieldType,
  SyntheticPerson,
  UndoResult,
} from '../types';
import { detectFieldType, scanFormFields } from './detector';
import { FieldMappingRule, matchDomainRule } from '../services/domainMapping';
import {
  BS_MONTHS,
  detectDateFormat,
  formatBsDate,
  splitBsDate,
  syncCompanionDateInput,
  triggerNepaliDatepickerHooks,
} from '../generator/nepaliCalendar';
import { toEnglishNumerals, toNepaliNumerals } from '../generator/numerals';
import { COMMERCIAL_BANKS } from '../generator/banks';

/**
 * Triggers native value change compatible with React, Vue, Angular and standard DOM.
 */
export function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

/**
 * Triggers native checked change for Checkbox and Radio elements.
 */
export function setNativeChecked(element: HTMLInputElement, checked: boolean): void {
  if (element.checked === checked) {
    return;
  }

  // Triggering click matches authentic user interaction in browsers/JSDOM
  element.click();

  if (element.checked !== checked) {
    const checkedSetter = Object.getOwnPropertyDescriptor(element, 'checked')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'checked')?.set;

    if (prototypeValueSetter && checkedSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, checked);
    } else if (checkedSetter) {
      checkedSetter.call(element, checked);
    } else {
      element.checked = checked;
    }

    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }
}


/**
 * Matches a select option against BS month names, aliases, and numbers.
 */
function matchBsMonthOption(
  options: HTMLOptionElement[],
  targetValue: string,
  altValue?: string
): HTMLOptionElement | undefined {
  const allTargets = [targetValue, altValue].filter(Boolean) as string[];
  const monthInfo = BS_MONTHS.find((m) =>
    allTargets.some((t) => {
      const tNorm = t.toLowerCase().trim();
      const tEng = toEnglishNumerals(tNorm);
      return (
        m.nameEn.toLowerCase() === tNorm ||
        m.nameNp === t.trim() ||
        m.number.toString() === tEng ||
        m.number.toString().padStart(2, '0') === tEng ||
        m.aliases.some((a) => a.toLowerCase() === tNorm)
      );
    })
  );

  if (!monthInfo) return undefined;

  return options.find((opt) => {
    const val = opt.value.trim();
    const text = opt.text.trim();
    const valEng = toEnglishNumerals(val);
    const textEng = toEnglishNumerals(text);
    const numStr = monthInfo.number.toString();
    const padNumStr = monthInfo.number.toString().padStart(2, '0');

    return (
      val.toLowerCase() === monthInfo.nameEn.toLowerCase() ||
      text.toLowerCase().includes(monthInfo.nameEn.toLowerCase()) ||
      val === monthInfo.nameNp ||
      text.includes(monthInfo.nameNp) ||
      valEng === numStr ||
      valEng === padNumStr ||
      textEng === numStr ||
      textEng === padNumStr ||
      monthInfo.aliases.some(
        (a) => val.toLowerCase() === a.toLowerCase() || text.toLowerCase().includes(a.toLowerCase())
      )
    );
  });
}

/**
 * Matches a select option against numeric values (years, days, wards) across English & Devanagari numerals.
 */
function matchNumericOption(
  options: HTMLOptionElement[],
  targetValue: string,
  altValue?: string
): HTMLOptionElement | undefined {
  const allTargets = [targetValue, altValue].filter(Boolean) as string[];
  const targetEngNums = allTargets
    .map((t) => toEnglishNumerals(t).replace(/[^0-9]/g, '').trim())
    .filter(Boolean);

  if (targetEngNums.length === 0) return undefined;

  for (const tNum of targetEngNums) {
    const cleanT = tNum.replace(/^0+/, '');
    const matched = options.find((opt) => {
      const valEng = toEnglishNumerals(opt.value).replace(/[^0-9]/g, '').replace(/^0+/, '').trim();
      const textEng = toEnglishNumerals(opt.text).replace(/[^0-9]/g, '').replace(/^0+/, '').trim();
      return (valEng && valEng === cleanT) || (textEng && textEng === cleanT);
    });
    if (matched) return matched;
  }

  return undefined;
}

/**
 * Matches a select option against driving license categories (A, B, K, motorcycle, car, etc.).
 */
function matchLicenseCategoryOption(
  options: HTMLOptionElement[],
  targetValue: string,
  altValue?: string
): HTMLOptionElement | undefined {
  const all = [targetValue, altValue].filter(Boolean) as string[];
  const isLicenseCat = all.some((s) => /category|वर्ग|motorcycle|car|scooter|license|सवारी/i.test(s));
  if (!isLicenseCat) return undefined;

  const catLetters: { en: string; np: string; keywords: string[] }[] = [
    { en: 'A', np: 'क', keywords: ['motorcycle', 'moped', 'bike', 'मोटरसाइकल'] },
    { en: 'B', np: 'ख', keywords: ['car', 'jeep', 'van', 'कार', 'भ्यान'] },
    { en: 'K', np: 'ट', keywords: ['scooter', 'स्कुटर'] },
  ];

  for (const cat of catLetters) {
    const matchesTarget = all.some((s) =>
      new RegExp(`(?:\\bcategory\\s*${cat.en}\\b|\\bवर्ग\\s*['"]?${cat.np}['"]?|\\b${cat.keywords.join('|')}\\b)`, 'i').test(s)
    );
    if (matchesTarget) {
      const found = options.find((opt) => {
        const val = opt.value.trim().toUpperCase();
        const text = opt.text.trim();
        return (
          val === cat.en ||
          val === cat.np ||
          text.includes(`Category ${cat.en}`) ||
          text.includes(`वर्ग ${cat.np}`) ||
          text.includes(`वर्ग '${cat.np}'`) ||
          cat.keywords.some((kw) => text.toLowerCase().includes(kw))
        );
      });
      if (found) return found;
    }
  }

  return undefined;
}

/**
 * Matches a select option against Nepal commercial banks.
 */
function matchBankOption(
  options: HTMLOptionElement[],
  targetValue: string,
  altValue?: string
): HTMLOptionElement | undefined {
  const all = [targetValue, altValue].filter(Boolean) as string[];
  const isBank = all.some((s) => /bank|बैंक|nabil|nic|global|rbb|nimb|everest|sanima|prabhu|kumari|siddhartha/i.test(s));
  if (!isBank) return undefined;

  // Resolve the primary value against every bank before trying the other script's value
  const candidates = all.flatMap((s) =>
    COMMERCIAL_BANKS.filter((b) => {
      const sLow = s.toLowerCase();
      return sLow.includes(b.shortName.toLowerCase()) || sLow.includes(b.nameEn.toLowerCase()) || s.includes(b.nameNp);
    })
  );

  for (const b of candidates) {
    const found = options.find((opt) => {
      const val = opt.value.toLowerCase();
      const text = opt.text.toLowerCase();
      const shortLow = b.shortName.toLowerCase();
      const nameEnLow = b.nameEn.toLowerCase();
      return (
        val.includes(shortLow) ||
        text.includes(shortLow) ||
        val.includes(nameEnLow) ||
        text.includes(nameEnLow) ||
        opt.value.includes(b.nameNp) ||
        opt.text.includes(b.nameNp) ||
        (b.swiftCode && (opt.value.toUpperCase() === b.swiftCode || opt.text.toUpperCase().includes(b.swiftCode)))
      );
    });
    if (found) return found;
  }

  return undefined;
}

/**
 * Matches a text or value against a Blood Group (A+, B+, O+, AB+, etc.).
 */
export function matchesBloodGroupText(textToTest: string, bloodGroup: string): boolean {
  if (!textToTest || !bloodGroup) return false;
  const cleanTarget = bloodGroup.trim().toUpperCase();
  const codeMatch = cleanTarget.match(/\b(A|B|AB|O)[+-]\b/i);
  const targetCode = codeMatch ? codeMatch[0].toUpperCase() : cleanTarget;

  const type = targetCode.slice(0, -1);
  const isPos = targetCode.endsWith('+');

  const textUpper = textToTest.trim().toUpperCase();
  if (textUpper === targetCode) return true;

  const escapedCode = targetCode.replace('+', '\\+').replace('-', '\\-');
  const codeRegex = new RegExp(`(^|[^a-zA-Z0-9])${escapedCode}([^a-zA-Z0-9]|$)`, 'i');
  if (codeRegex.test(textToTest)) return true;

  // Normalize underscores to spaces so A_POS, B_NEG, O_POSITIVE match word boundaries
  const normalizedText = textToTest.replace(/[_]/g, ' ');

  const isPositiveMentioned = /pos|\+|पोजेटिभ/i.test(normalizedText);
  const isNegativeMentioned = /neg|\-|नेगेटिभ/i.test(normalizedText);

  if (isPos && !isPositiveMentioned) return false;
  if (!isPos && !isNegativeMentioned) return false;

  if (type === 'AB') {
    return /\bAB\b|एबी|ए\s*बी/i.test(normalizedText);
  } else if (type === 'A') {
    return /\bA\b|ए(?!बी)/i.test(normalizedText) && !/\bAB\b|एबी|ए\s*बी/i.test(normalizedText);
  } else if (type === 'B') {
    return /\bB\b|बी/i.test(normalizedText) && !/\bAB\b|एबी|ए\s*बी/i.test(normalizedText);
  } else if (type === 'O') {
    return /\bO\b|ओ/i.test(normalizedText);
  }

  return false;
}

/**
 * Matches a select option against Blood Groups (A+, B+, O+, AB+, etc.).
 */
function matchBloodGroupOption(
  options: HTMLOptionElement[],
  targetValue: string,
  altValue?: string
): HTMLOptionElement | undefined {
  const all = [targetValue, altValue].filter(Boolean) as string[];
  const codeMatch = all.map((s) => s.match(/\b(A|B|AB|O)[+-]\b/i)).find(Boolean);
  const targetCode = codeMatch ? codeMatch[0].toUpperCase() : undefined;
  if (!targetCode) return undefined;

  for (const opt of options) {
    const combined = `${opt.value} ${opt.text}`;
    if (matchesBloodGroupText(combined, targetCode)) {
      return opt;
    }
  }

  return undefined;
}


function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GENDER_TOKENS: Record<'male' | 'female' | 'other', string[]> = {
  male: ['male', 'm', 'man', 'men', 'boy', 'mr', 'purush', 'पुरुष', 'केटा'],
  female: ['female', 'f', 'woman', 'women', 'girl', 'mrs', 'ms', 'mahila', 'महिला', 'केटी'],
  other: ['other', 'others', 'o', 'third', 'nonbinary', 'non-binary', 'anya', 'अन्य', 'तेस्रो'],
};

/**
 * Whole-word gender matcher. Substring checks are wrong here because "female" contains "male".
 */
export function matchesGenderText(text: string, gender: string): boolean {
  const g = gender.trim().toLowerCase();
  const key: keyof typeof GENDER_TOKENS =
    g.startsWith('f') || g === 'महिला' ? 'female' : g.startsWith('m') || g === 'पुरुष' ? 'male' : 'other';
  const words = text.toLowerCase().split(/[^a-z\u0900-\u097f-]+/).filter(Boolean);
  return words.some((w) => GENDER_TOKENS[key].includes(w));
}

/**
 * Collects the visible text describing a radio/checkbox: its value, labels, and aria-label.
 */
function describeChoice(input: HTMLElement): string {
  const parts: string[] = [];
  if (input instanceof HTMLInputElement) {
    parts.push(input.value || '');
    if (input.labels) {
      for (const lbl of Array.from(input.labels)) parts.push(lbl.textContent || '');
    }
  } else {
    parts.push(input.getAttribute('value') || '', input.textContent || '');
  }
  parts.push(input.getAttribute('aria-label') || '');
  return parts.join(' ');
}

/**
 * Finds the closest matching option for a select element, supporting dual-script alternatives.
 */
function fillSelectElement(select: HTMLSelectElement, targetValue: string, altValue?: string): boolean {
  const options = Array.from(select.options);
  if (options.length === 0) return false;

  const targetLower = targetValue.toLowerCase();
  const altLower = altValue ? altValue.toLowerCase() : undefined;

  // 1. Exact value or text match (primary target first, then the other script's value).
  //    Exact matching must run before substring matching, otherwise "Male" selects "Female" and ward "1" selects "10".
  const exactMatch = (needle: string) =>
    options.find((opt) => opt.value.trim().toLowerCase() === needle || opt.text.trim().toLowerCase() === needle);
  let matchedOption = exactMatch(targetLower.trim()) || (altLower ? exactMatch(altLower.trim()) : undefined);

  // 2. Substring match on option text, on word boundaries only for short targets
  const containsMatch = (needle: string) => {
    const n = needle.trim();
    if (!n) return undefined;
    if (n.length <= 3) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(n)}($|[^\\p{L}\\p{N}])`, 'iu');
      return options.find((opt) => re.test(opt.text));
    }
    return options.find((opt) => opt.text.toLowerCase().includes(n));
  };
  if (!matchedOption) {
    matchedOption = containsMatch(targetLower) || (altLower ? containsMatch(altLower) : undefined);
  }

  // 3. BS Month option matching (Baishakh, बैशाख, 1, 01, etc.)
  if (!matchedOption) {
    matchedOption = matchBsMonthOption(options, targetValue, altValue);
  }

  // 4. Numeric option matching (years, days, wards across scripts)
  if (!matchedOption) {
    matchedOption = matchNumericOption(options, targetValue, altValue);
  }

  // 5. License Category option matching
  if (!matchedOption) {
    matchedOption = matchLicenseCategoryOption(options, targetValue, altValue);
  }

  // 6. Commercial Bank option matching
  if (!matchedOption) {
    matchedOption = matchBankOption(options, targetValue, altValue);
  }

  // 7. Blood Group option matching
  if (!matchedOption) {
    matchedOption = matchBloodGroupOption(options, targetValue, altValue);
  }

  // 8. Partial word match with primary target: the real option sharing the most words.
  //    Placeholders are skipped, otherwise "-- Select Faculty --" wins for "Faculty of Science".
  if (!matchedOption) {
    const words = targetLower.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3);
    let bestScore = 0;
    for (const opt of options) {
      if (opt.disabled || opt.value === '') continue;
      const optText = opt.text.toLowerCase();
      const score = words.filter((word) => optText.includes(word)).length;
      if (score > bestScore) {
        bestScore = score;
        matchedOption = opt;
      }
    }
  }

  // 9. Still no match: pick the first real (non-placeholder, enabled) option
  if (!matchedOption) {
    const realOptions = options.filter((opt) => !opt.disabled && opt.value !== '');
    matchedOption = realOptions[0] || options[0];
  }

  if (matchedOption) {
    setNativeValue(select, matchedOption.value);
    return true;
  }

  return false;
}

/**
 * Determines whether a given field category should be filled based on user options.
 */
function isCategoryEnabled(fieldType: SupportedFieldType, options: FillOptions): boolean {
  const { fillCategories } = options;

  switch (fieldType) {
    case 'fullName':
    case 'firstName':
    case 'middleName':
    case 'lastName':
    case 'gender':
    case 'dateOfBirth':
    case 'dateOfBirthBS':
    case 'dateBS':
    case 'bsYear':
    case 'bsMonth':
    case 'bsDay':
    case 'age':
    case 'studentId':
    case 'school':
    case 'grade':
    case 'faculty':
    case 'guardianName':
    case 'guardianPhone':
    case 'citizenshipNumber':
    case 'citizenshipIssueDistrict':
    case 'citizenshipIssueDateBS':
    case 'citizenshipIssuedBy':
    case 'nationalId':
    case 'passportNumber':
    case 'passportIssueDate':
    case 'passportExpiryDate':
    case 'passportIssuedBy':
    case 'drivingLicenseNumber':
    case 'drivingLicenseCategory':
    case 'drivingLicenseIssueDate':
    case 'drivingLicenseExpiryDate':
    case 'bankName':
    case 'bankBranch':
    case 'bankAccountNumber':
    case 'bankAccountName':
    case 'esewaId':
    case 'khaltiId':
    case 'bloodGroup':
      return fillCategories.personal || fillCategories.professional;

    case 'email':
    case 'phone':
    case 'telephone':
      return fillCategories.contact;

    case 'province':
    case 'permanentProvince':
    case 'temporaryProvince':
    case 'currentProvince':
    case 'district':
    case 'permanentDistrict':
    case 'temporaryDistrict':
    case 'currentDistrict':
    case 'municipality':
    case 'permanentMunicipality':
    case 'temporaryMunicipality':
    case 'currentMunicipality':
    case 'ward':
    case 'permanentWard':
    case 'temporaryWard':
    case 'currentWard':
    case 'tole':
    case 'permanentTole':
    case 'temporaryTole':
    case 'currentTole':
    case 'address':
    case 'permanentAddress':
    case 'temporaryAddress':
    case 'currentAddress':
    case 'sameAsPermanent':
      return fillCategories.address;

    case 'occupation':
    case 'jobTitle':
    case 'designation':
    case 'department':
    case 'companyName':
    case 'employeeId':
    case 'panNumber':
    case 'vatNumber':
    case 'salary':
    case 'businessName':
    case 'businessType':
    case 'cooperative':
    case 'cropType':
    case 'subject':
      return fillCategories.professional;

    case 'username':
    case 'password':
    case 'number':
    case 'date':
    case 'text':
    case 'textarea':
    case 'url':
    case 'referenceNumber':
      return true;

    case 'unknown':
    default:
      return false;
  }
}

/**
 * Maps a detected field type to the corresponding value from the synthetic person,
 * supporting both English and authentic Devanagari (नेपाली युनिकोड) scripts.
 */
export function getFieldValue(
  type: SupportedFieldType,
  person: SyntheticPerson,
  script?: FillScript,
  addressScope?: 'permanent' | 'temporary'
): string {
  const isTemporary =
    addressScope === 'temporary' ||
    type === 'temporaryAddress' ||
    type === 'currentAddress' ||
    type === 'temporaryProvince' ||
    type === 'currentProvince' ||
    type === 'temporaryDistrict' ||
    type === 'currentDistrict' ||
    type === 'temporaryMunicipality' ||
    type === 'currentMunicipality' ||
    type === 'temporaryWard' ||
    type === 'currentWard' ||
    type === 'temporaryTole' ||
    type === 'currentTole';

  if (script === 'np' && person.devanagari) {
    const dev = person.devanagari;
    switch (type) {
      case 'fullName':
        return dev.fullName;
      case 'firstName':
        return dev.firstName;
      case 'middleName':
        return dev.middleName || '';
      case 'lastName':
        return dev.lastName;
      case 'gender':
        return dev.gender;
      case 'province':
      case 'permanentProvince':
      case 'temporaryProvince':
      case 'currentProvince':
        return isTemporary
          ? dev.tempProvince || dev.currentProvince || dev.province
          : dev.permanentProvince || dev.province;
      case 'district':
      case 'permanentDistrict':
      case 'temporaryDistrict':
      case 'currentDistrict':
        return isTemporary
          ? dev.tempDistrict || dev.currentDistrict || dev.district
          : dev.permanentDistrict || dev.district;
      case 'municipality':
      case 'permanentMunicipality':
      case 'temporaryMunicipality':
      case 'currentMunicipality':
        return isTemporary
          ? dev.tempMunicipality || dev.currentMunicipality || dev.municipality
          : dev.permanentMunicipality || dev.municipality;
      case 'ward':
      case 'permanentWard':
      case 'temporaryWard':
      case 'currentWard': {
        const w = isTemporary
          ? dev.tempWard || dev.currentWard || dev.ward
          : dev.permanentWard || dev.ward;
        return w.replace('वडा नं. ', '');
      }
      case 'tole':
      case 'permanentTole':
      case 'temporaryTole':
      case 'currentTole':
        return isTemporary
          ? dev.tempTole || dev.currentTole || dev.tole
          : dev.permanentTole || dev.tole;
      case 'address':
      case 'permanentAddress':
      case 'temporaryAddress':
      case 'currentAddress':
        return isTemporary
          ? dev.tempFullAddress || dev.currentFullAddress || dev.fullAddress
          : dev.permanentFullAddress || dev.fullAddress;
      case 'occupation':
        return dev.occupation;
      case 'jobTitle':
        return dev.jobTitle;
      case 'designation':
        return dev.designation || dev.jobTitle;
      case 'department':
        return dev.department;
      case 'companyName':
        return dev.companyName;
      case 'businessName':
        return dev.businessName || dev.companyName;
      case 'businessType':
        return dev.businessType || 'प्राइभेट लिमिटेड';
      case 'school':
        return dev.school || dev.companyName;
      case 'grade':
        return dev.grade || 'स्नातक तह';
      case 'faculty':
        return dev.faculty || 'विज्ञान तथा प्रविधि संकाय';
      case 'guardianName':
        return dev.guardianName || dev.fullName;
      case 'cooperative':
        return dev.cooperative || 'साना किसान कृषि सहकारी संस्था लि.';
      case 'cropType':
        return dev.cropType || 'धान (Paddy)';
      case 'subject':
        return dev.subject || 'कम्प्युटर विज्ञान';
      case 'dateOfBirthBS':
      case 'dateBS': {
        const bsDate = person.dateOfBirthBS || '2055-01-15';
        return toNepaliNumerals(bsDate);
      }
      case 'bsYear': {
        const bsDate = person.dateOfBirthBS || '2055-01-15';
        return toNepaliNumerals(splitBsDate(bsDate).year);
      }
      case 'bsMonth': {
        const bsDate = person.dateOfBirthBS || '2055-01-15';
        return splitBsDate(bsDate).monthNameNp;
      }
      case 'bsDay': {
        const bsDate = person.dateOfBirthBS || '2055-01-15';
        return toNepaliNumerals(splitBsDate(bsDate).day);
      }
      case 'citizenshipNumber':
        return dev.citizenshipNumber || (person.citizenshipNumber ? toNepaliNumerals(person.citizenshipNumber) : '');
      case 'citizenshipIssueDistrict':
        return dev.citizenshipIssueDistrict || dev.permanentDistrict || dev.district;
      case 'citizenshipIssueDateBS':
        return dev.citizenshipIssueDateBS || (person.citizenshipIssueDateBS ? toNepaliNumerals(person.citizenshipIssueDateBS) : '');
      case 'citizenshipIssuedBy':
        return dev.citizenshipIssuedBy || 'जिल्ला प्रशासन कार्यालय';
      case 'nationalId':
        return dev.nationalId || (person.nationalId ? toNepaliNumerals(person.nationalId) : '');
      case 'passportNumber':
        return dev.passportNumber || person.passportNumber || '';
      case 'passportIssueDate':
        return dev.passportIssueDate || (person.passportIssueDate ? toNepaliNumerals(person.passportIssueDate) : '');
      case 'passportExpiryDate':
        return dev.passportExpiryDate || (person.passportExpiryDate ? toNepaliNumerals(person.passportExpiryDate) : '');
      case 'passportIssuedBy':
        return dev.passportIssuedBy || 'राहदानी विभाग';
      case 'drivingLicenseNumber':
        return dev.drivingLicenseNumber || (person.drivingLicenseNumber ? toNepaliNumerals(person.drivingLicenseNumber) : '');
      case 'drivingLicenseCategory':
        return dev.drivingLicenseCategory || person.drivingLicenseCategory || '';
      case 'drivingLicenseIssueDate':
        return dev.drivingLicenseIssueDate || (person.drivingLicenseIssueDate ? toNepaliNumerals(person.drivingLicenseIssueDate) : '');
      case 'drivingLicenseExpiryDate':
        return dev.drivingLicenseExpiryDate || (person.drivingLicenseExpiryDate ? toNepaliNumerals(person.drivingLicenseExpiryDate) : '');
      case 'bankName':
        return dev.bankName || 'नबिल बैंक लिमिटेड';
      case 'bankBranch':
        return dev.bankBranch || 'पुतलीसडक शाखा';
      case 'bankAccountNumber':
        return dev.bankAccountNumber || (person.bankAccountNumber ? toNepaliNumerals(person.bankAccountNumber) : '०१२३४५६७८९०१२३४५');
      case 'bankAccountName':
        return dev.bankAccountName || dev.fullName;
      case 'esewaId':
        return dev.esewaId || (person.esewaId ? toNepaliNumerals(person.esewaId) : (person.phone ? toNepaliNumerals(person.phone) : '९८४१२३४५६७'));
      case 'khaltiId':
        return dev.khaltiId || (person.khaltiId ? toNepaliNumerals(person.khaltiId) : (person.phone ? toNepaliNumerals(person.phone) : '९८४१२३४५६७'));
      case 'bloodGroup':
        return dev.bloodGroup || person.bloodGroup || 'O+';
      case 'textarea':
        return `${dev.fullName}को विवरण। ठेगाना: ${dev.fullAddress}। पेशा: ${dev.occupation}।`;
      case 'text':
        return dev.fullName;
    }
  }

  const targetAddress = isTemporary
    ? person.temporaryAddress || person.currentAddress || person.address
    : person.permanentAddress || person.address;

  switch (type) {
    case 'fullName':
      return person.fullName;
    case 'firstName':
      return person.firstName;
    case 'middleName':
      return person.middleName || '';
    case 'lastName':
      return person.lastName;
    case 'gender':
      return person.gender;
    case 'dateOfBirth':
      return person.dateOfBirth;
    case 'dateOfBirthBS':
    case 'dateBS':
      return person.dateOfBirthBS || '2055-01-15';
    case 'bsYear': {
      const bsDate = person.dateOfBirthBS || '2055-01-15';
      return splitBsDate(bsDate).year;
    }
    case 'bsMonth': {
      const bsDate = person.dateOfBirthBS || '2055-01-15';
      return splitBsDate(bsDate).monthNameEn;
    }
    case 'bsDay': {
      const bsDate = person.dateOfBirthBS || '2055-01-15';
      return splitBsDate(bsDate).day;
    }
    case 'age':
      return person.age.toString();
    case 'email':
      return person.email;
    case 'phone':
      return person.phone;
    case 'telephone':
      return person.telephone;
    case 'province':
    case 'permanentProvince':
    case 'temporaryProvince':
    case 'currentProvince':
      return targetAddress.province;
    case 'district':
    case 'permanentDistrict':
    case 'temporaryDistrict':
    case 'currentDistrict':
      return targetAddress.district;
    case 'municipality':
    case 'permanentMunicipality':
    case 'temporaryMunicipality':
    case 'currentMunicipality':
      return targetAddress.municipality;
    case 'ward':
    case 'permanentWard':
    case 'temporaryWard':
    case 'currentWard':
      return targetAddress.ward.toString();
    case 'tole':
    case 'permanentTole':
    case 'temporaryTole':
    case 'currentTole':
      return targetAddress.tole;
    case 'address':
    case 'permanentAddress':
    case 'temporaryAddress':
    case 'currentAddress':
      return targetAddress.fullAddress;
    case 'occupation':
      return person.occupation;
    case 'jobTitle':
      return person.jobTitle;
    case 'designation':
      return person.designation || person.jobTitle;
    case 'department':
      return person.department;
    case 'companyName':
      return person.companyName;
    case 'businessName':
      return person.businessName || person.companyName;
    case 'businessType':
      return person.businessType || 'Private Limited';
    case 'studentId':
      return person.studentId || 'STD-2026-1024';
    case 'school':
      return person.school || person.companyName;
    case 'grade':
      return person.grade || 'Bachelors Degree';
    case 'faculty':
      return person.faculty || 'Faculty of Science & Technology';
    case 'guardianName':
      return person.guardianName || person.fullName;
    case 'guardianPhone':
      return person.guardianPhone || person.phone;
    case 'employeeId':
      return person.employeeId || 'EMP-10293';
    case 'salary':
      return person.salary || '45,000 NPR';
    case 'panNumber':
      return person.panNumber || '102938475';
    case 'citizenshipNumber':
      return person.citizenshipNumber || `27-01-78-${Math.floor(10000 + Math.random() * 90000)}`;
    case 'citizenshipIssueDistrict':
      return person.citizenshipIssueDistrict || targetAddress.district;
    case 'citizenshipIssueDateBS':
      return person.citizenshipIssueDateBS || '2075-04-12';
    case 'citizenshipIssuedBy':
      return person.citizenshipIssuedBy || `District Administration Office, ${targetAddress.district}`;
    case 'nationalId':
      return person.nationalId || `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    case 'passportNumber':
      return person.passportNumber || 'PA1234567';
    case 'passportIssueDate':
      return person.passportIssueDate || '2020-05-15';
    case 'passportExpiryDate':
      return person.passportExpiryDate || '2030-05-14';
    case 'passportIssuedBy':
      return person.passportIssuedBy || 'Department of Passports, Kathmandu';
    case 'drivingLicenseNumber':
      return person.drivingLicenseNumber || '01-06-00123456';
    case 'drivingLicenseCategory':
      return person.drivingLicenseCategory || 'Category B: Car/Jeep/Van';
    case 'drivingLicenseIssueDate':
      return person.drivingLicenseIssueDate || '2021-03-10';
    case 'drivingLicenseExpiryDate':
      return person.drivingLicenseExpiryDate || '2026-03-09';
    case 'bankName':
      return person.bankName || 'Nabil Bank Limited';
    case 'bankBranch':
      return person.bankBranch || 'Putalisadak Branch';
    case 'bankAccountNumber':
      return person.bankAccountNumber || '0123456789012345';
    case 'bankAccountName':
      return person.bankAccountName || person.fullName;
    case 'esewaId':
      return person.esewaId || person.phone;
    case 'khaltiId':
      return person.khaltiId || person.phone;
    case 'bloodGroup':
      return person.bloodGroup || 'O+';
    case 'vatNumber':
      return person.vatNumber || (person.panNumber ? `VAT-${person.panNumber}` : 'VAT-102938475');
    case 'cooperative':
      return person.cooperative || 'Small Farmers Agriculture Cooperative Ltd.';
    case 'cropType':
      return person.cropType || 'Paddy (Dhan)';
    case 'subject':
      return person.subject || 'Computer Science';
    case 'username':
      return person.username;
    case 'password':
      return person.password;

    case 'url':
      return `https://${person.username}.example.test`;
    case 'referenceNumber':
      return `REF-${Math.floor(100000 + Math.random() * 900000)}`;
    case 'number':
      return Math.floor(10 + Math.random() * 90).toString();
    case 'date':
      return person.dateOfBirth;
    case 'textarea':
      return `Synthetic test profile for ${person.fullName}. Address: ${person.address.fullAddress}.`;
    case 'text':
      return person.fullName;
    default:
      return '';
  }
}

/**
 * Helper to fill a single DOM element based on resolved field type.
 */
function fillFieldElement(
  elem: HTMLElement,
  fieldType: SupportedFieldType,
  person: SyntheticPerson,
  fieldIdentifier: string | undefined,
  details: FillResult['details'],
  script?: FillScript,
  addressScope?: 'permanent' | 'temporary'
): boolean {
  const tagName = elem.tagName.toLowerCase();
  const inputType = (elem.getAttribute('type') || '').toLowerCase();
  const role = elem.getAttribute('role') || '';

  // Handle Custom ARIA Checkbox & Radio
  if (role === 'checkbox') {
    elem.setAttribute('aria-checked', 'true');
    elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    details.push({ field: fieldIdentifier || 'custom_checkbox', type: fieldType, value: true });
    return true;
  }
  if (role === 'radio') {
    if (fieldType === 'gender') {
      if (matchesGenderText(describeChoice(elem), person.gender)) {
        elem.setAttribute('aria-checked', 'true');
        elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        details.push({ field: fieldIdentifier || 'custom_radio_gender', type: fieldType, value: true });
        return true;
      }
    } else if (fieldType === 'bloodGroup') {
      const targetGroup = person.bloodGroup || 'O+';
      const text = `${elem.textContent || ''} ${elem.getAttribute('value') || ''} ${elem.getAttribute('aria-label') || ''}`;
      if (matchesBloodGroupText(text, targetGroup)) {
        elem.setAttribute('aria-checked', 'true');
        elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        details.push({ field: fieldIdentifier || 'custom_radio_blood_group', type: fieldType, value: targetGroup });
        return true;
      }
    }
  }

  // Handle HTML5 Checkboxes & Radio buttons
  if (tagName === 'input' && (inputType === 'checkbox' || inputType === 'radio')) {
    const inputElem = elem as HTMLInputElement;
    if (fieldType === 'gender' && inputType === 'radio') {
      if (matchesGenderText(describeChoice(inputElem), person.gender)) {
        setNativeChecked(inputElem, true);
        details.push({ field: fieldIdentifier || 'radio_gender', type: fieldType, value: true });
        return true;
      }
    } else if (fieldType === 'bloodGroup' && inputType === 'radio') {
      const targetGroup = person.bloodGroup || 'O+';
      const val = inputElem.value || '';
      const labelText = inputElem.labels && inputElem.labels[0] ? inputElem.labels[0].textContent || '' : '';
      const parentLabel = inputElem.closest('label')?.textContent || '';
      const ariaLabel = inputElem.getAttribute('aria-label') || '';
      const nextSiblingText = inputElem.nextSibling?.textContent || '';
      const combined = `${val} ${labelText} ${parentLabel} ${ariaLabel} ${nextSiblingText}`;

      if (matchesBloodGroupText(combined, targetGroup)) {
        setNativeChecked(inputElem, true);
        details.push({ field: fieldIdentifier || 'radio_blood_group', type: fieldType, value: targetGroup });
        return true;
      }
    } else if (inputType === 'checkbox') {
      if (
        fieldType === 'sameAsPermanent' ||
        /(?:same\s*as\s*(?:perm|permanent|sthayi|sthayee)|sameaspermanent|same_as_permanent|same_as_perm|same_perm|copy_permanent|same_address|sthayi_saraha|sthayee_sara)\b|स्थायी\s*(?:ठेगाना\s*)?(?:अनुसार|जस्तै|सरह)|हालको\s*ठेगाना\s*स्थायी\s*सरह/i.test(
          fieldIdentifier || ''
        ) ||
        /(?:same\s*as\s*(?:perm|permanent)|sameaspermanent|same_as_permanent)/i.test(
          `${elem.id || ''} ${elem.getAttribute('name') || ''} ${elem.getAttribute('aria-label') || ''}`
        )
      ) {
        setNativeChecked(inputElem, true);
        details.push({ field: fieldIdentifier || 'same_as_permanent', type: 'sameAsPermanent', value: true });
        return true;
      } else if (/terms|agree|policy/i.test(fieldIdentifier || '')) {
        setNativeChecked(inputElem, true);
        details.push({ field: fieldIdentifier || 'checkbox', type: fieldType, value: true });
        return true;
      }
    }
    return false;
  }

  // Handle BS Datepicker inputs (custom format detection, Nepali datepicker hooks, companion sync)
  if (fieldType === 'dateBS' || fieldType === 'dateOfBirthBS') {
    const bsDate = person.dateOfBirthBS || '2055-01-15';
    const format = detectDateFormat(elem);
    const targetScript = script === 'np' ? 'np' : 'en';
    const formattedBsDate = formatBsDate(bsDate, { format, script: targetScript });

    if (tagName === 'input') {
      const inputElem = elem as HTMLInputElement;
      setNativeValue(inputElem, formattedBsDate);
      triggerNepaliDatepickerHooks(inputElem, formattedBsDate, person.dateOfBirth);
      details.push({ field: fieldIdentifier || 'date_bs', type: fieldType, value: formattedBsDate });
      return true;
    }
  }

  const primaryValue = getFieldValue(fieldType, person, script, addressScope);
  const altValue =
    script === 'np'
      ? getFieldValue(fieldType, person, 'en', addressScope)
      : getFieldValue(fieldType, person, 'np', addressScope);

  // Handle Select elements
  if (tagName === 'select') {
    const selectElem = elem as HTMLSelectElement;
    if (primaryValue && fillSelectElement(selectElem, primaryValue, altValue)) {
      details.push({ field: fieldIdentifier || 'select', type: fieldType, value: primaryValue });
      return true;
    }
    return false;
  }

  // Handle Combobox / React-Select / Ant Design / MUI Autocomplete search input
  if (role === 'combobox' || elem.hasAttribute('aria-autocomplete') || elem.classList.contains('ant-select-selection-search-input')) {
    if (primaryValue) {
      setNativeValue(elem as HTMLInputElement, primaryValue);
      elem.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
      elem.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
      details.push({ field: fieldIdentifier || 'combobox', type: fieldType, value: primaryValue });
      return true;
    }
  }

  // Handle Standard Input and Textarea elements
  if (tagName === 'input' || tagName === 'textarea') {
    const inputElem = elem as HTMLInputElement | HTMLTextAreaElement;
    if (primaryValue) {
      // Number, tel, email, date and url inputs reject Devanagari digits (the value silently becomes empty)
      const asciiOnly = /^(number|tel|email|date|datetime-local|month|url)$/.test(inputType);
      let scriptSafe = asciiOnly ? toEnglishNumerals(primaryValue) : primaryValue;
      // Number inputs drop anything that isn't a plain number, e.g. "45,000 NPR" or "3.6 GPA"
      if (inputType === 'number') {
        scriptSafe = scriptSafe.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] || '';
        if (!scriptSafe) return false;
      }
      const maxLength = inputElem.maxLength;
      const value = maxLength > 0 && scriptSafe.length > maxLength ? scriptSafe.slice(0, maxLength) : scriptSafe;
      setNativeValue(inputElem, value);
      if (tagName === 'input' && (fieldType === 'dateOfBirth' || fieldType === 'date')) {
        syncCompanionDateInput(inputElem as HTMLInputElement, person.dateOfBirthBS || '2055-01-15', 'bs');
      }
      details.push({ field: fieldIdentifier || 'input', type: fieldType, value });
      return true;
    }
  }

  return false;
}

/**
 * Inspects all interactive form fields on the page, categorizing each field
 * according to the strict precedence hierarchy:
 * 1. Custom Domain Mapping Override
 * 2. Heuristic Rule-Based Detector
 * 3. Unmapped / Generic Fallback
 */
export function inspectPageFields(
  root: Document | HTMLElement | ShadowRoot = document,
  domainRules: FieldMappingRule[] = []
): PageFieldInspection[] {
  const detected = scanFormFields(root);
  const inspections: PageFieldInspection[] = [];

  detected.forEach((field, index) => {
    const elem = field.element as HTMLInputElement;
    const rule = matchDomainRule(elem, domainRules);

    if (rule) {
      inspections.push({
        index,
        name: field.name,
        id: field.id,
        placeholder: elem.placeholder,
        label: field.label,
        type: elem.getAttribute('type') || elem.tagName.toLowerCase(),
        detectedType: rule.targetType,
        confidence: 1.0,
        source: 'domain_override',
      });
    } else if (field.type !== 'unknown' && field.type !== 'text') {
      inspections.push({
        index,
        name: field.name,
        id: field.id,
        placeholder: elem.placeholder,
        label: field.label,
        type: elem.getAttribute('type') || elem.tagName.toLowerCase(),
        detectedType: field.type,
        confidence: field.confidence,
        source: 'heuristic',
      });
    } else if (field.type === 'text' && field.confidence > 0.4) {
      inspections.push({
        index,
        name: field.name,
        id: field.id,
        placeholder: elem.placeholder,
        label: field.label,
        type: elem.getAttribute('type') || elem.tagName.toLowerCase(),
        detectedType: field.type,
        confidence: field.confidence,
        source: 'heuristic',
      });
    } else {
      inspections.push({
        index,
        name: field.name,
        id: field.id,
        placeholder: elem.placeholder,
        label: field.label,
        type: elem.getAttribute('type') || elem.tagName.toLowerCase(),
        detectedType: 'unknown',
        confidence: 0,
        source: 'unmapped',
      });
    }
  });

  return inspections;
}

let lastFormSnapshot: FormSnapshot | null = null;

export function getLastSnapshot(): FormSnapshot | null {
  return lastFormSnapshot;
}

export function setLastSnapshot(snapshot: FormSnapshot | null): void {
  lastFormSnapshot = snapshot;
}

export function clearSnapshot(): void {
  lastFormSnapshot = null;
}

/**
 * Captures an instantaneous snapshot of all active form elements on the page
 * before any automated data is populated.
 */
export function captureFormSnapshot(root: Document | HTMLElement | ShadowRoot = document): FormSnapshot {
  const detected = scanFormFields(root);
  const fields: FieldSnapshot[] = [];

  for (const item of detected) {
    const elem = item.element;
    const tagName = elem.tagName.toLowerCase();
    const inputType = (elem.getAttribute('type') || '').toLowerCase();
    const role = elem.getAttribute('role') || '';

    if (role === 'checkbox' || role === 'radio') {
      fields.push({
        element: elem,
        type: role === 'checkbox' ? 'aria-checkbox' : 'aria-radio',
        ariaChecked: elem.getAttribute('aria-checked'),
      });
    } else if (tagName === 'input') {
      const inputElem = elem as HTMLInputElement;
      if (inputType === 'checkbox' || inputType === 'radio') {
        fields.push({
          element: inputElem,
          type: inputType === 'checkbox' ? 'checkbox' : 'radio',
          checked: inputElem.checked,
          value: inputElem.value,
        });
      } else {
        fields.push({
          element: inputElem,
          type: 'input',
          value: inputElem.value,
        });
      }
    } else if (tagName === 'textarea') {
      fields.push({
        element: elem,
        type: 'textarea',
        value: (elem as HTMLTextAreaElement).value,
      });
    } else if (tagName === 'select') {
      const selectElem = elem as HTMLSelectElement;
      fields.push({
        element: selectElem,
        type: 'select',
        value: selectElem.value,
        selectedIndex: selectElem.selectedIndex,
      });
    }
  }

  const snapshot: FormSnapshot = {
    timestamp: Date.now(),
    fields,
  };

  return snapshot;
}

/**
 * Reverts the form fields to their pre-fill snapshot state.
 * If no snapshot exists, clears all interactive form fields on the page.
 */
export function revertForm(
  root: Document | HTMLElement | ShadowRoot = document,
  snapshot?: FormSnapshot | null
): UndoResult {
  const targetSnapshot = snapshot !== undefined ? snapshot : lastFormSnapshot;

  if (targetSnapshot && targetSnapshot.fields.length > 0) {
    let revertedCount = 0;
    const details: NonNullable<UndoResult['details']> = [];

    for (const item of targetSnapshot.fields) {
      const elem = item.element;
      if (!elem.isConnected && typeof document !== 'undefined' && !document.contains(elem)) {
        continue;
      }

      const identifier = elem.getAttribute('name') || elem.id || elem.getAttribute('aria-label') || 'field';

      if (item.type === 'checkbox' || item.type === 'radio') {
        const input = elem as HTMLInputElement;
        const targetChecked = Boolean(item.checked);
        if (input.checked !== targetChecked) {
          setNativeChecked(input, targetChecked);
          revertedCount++;
          details.push({ field: identifier, restoredValue: targetChecked });
        }
      } else if (item.type === 'input' || item.type === 'textarea') {
        const input = elem as HTMLInputElement | HTMLTextAreaElement;
        const targetVal = item.value ?? '';
        if (input.value !== targetVal) {
          setNativeValue(input, targetVal);
          revertedCount++;
          details.push({ field: identifier, restoredValue: targetVal });
        }
      } else if (item.type === 'select') {
        const select = elem as HTMLSelectElement;
        const targetIdx = item.selectedIndex ?? 0;
        const targetVal = item.value ?? '';
        if (select.selectedIndex !== targetIdx || select.value !== targetVal) {
          if (item.value !== undefined) {
            setNativeValue(select, targetVal);
          } else {
            select.selectedIndex = targetIdx;
            select.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          }
          revertedCount++;
          details.push({ field: identifier, restoredValue: targetVal });
        }
      } else if (item.type === 'aria-checkbox' || item.type === 'aria-radio') {
        const prevAriaChecked = item.ariaChecked;
        const currentAriaChecked = elem.getAttribute('aria-checked');
        if (currentAriaChecked !== prevAriaChecked) {
          if (typeof prevAriaChecked === 'string') {
            elem.setAttribute('aria-checked', prevAriaChecked);
          } else {
            elem.removeAttribute('aria-checked');
          }
          elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          revertedCount++;
          details.push({ field: identifier, restoredValue: prevAriaChecked ?? 'none' });
        }
      }
    }

    return {
      success: true,
      revertedCount,
      action: 'reverted',
      details,
    };
  }

  // Fallback: If no snapshot is present, clear/reset all active form fields on root
  return clearForm(root);
}

/**
 * 1-Click Clear Form: Resets all active interactive fields on the page.
 */
export function clearForm(root: Document | HTMLElement | ShadowRoot = document): UndoResult {
  const detected = scanFormFields(root);
  let revertedCount = 0;
  const details: NonNullable<UndoResult['details']> = [];

  for (const item of detected) {
    const elem = item.element;
    const tagName = elem.tagName.toLowerCase();
    const inputType = (elem.getAttribute('type') || '').toLowerCase();
    const role = elem.getAttribute('role') || '';
    const identifier = elem.getAttribute('name') || elem.id || 'field';

    if (role === 'checkbox' || role === 'radio') {
      if (elem.getAttribute('aria-checked') === 'true') {
        elem.removeAttribute('aria-checked');
        elem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        revertedCount++;
        details.push({ field: identifier, restoredValue: false });
      }
    } else if (tagName === 'input') {
      const input = elem as HTMLInputElement;
      if (inputType === 'checkbox' || inputType === 'radio') {
        if (input.checked) {
          setNativeChecked(input, false);
          revertedCount++;
          details.push({ field: identifier, restoredValue: false });
        }
      } else {
        if (input.value !== '') {
          setNativeValue(input, '');
          revertedCount++;
          details.push({ field: identifier, restoredValue: '' });
        }
      }
    } else if (tagName === 'textarea') {
      const ta = elem as HTMLTextAreaElement;
      if (ta.value !== '') {
        setNativeValue(ta, '');
        revertedCount++;
        details.push({ field: identifier, restoredValue: '' });
      }
    } else if (tagName === 'select') {
      const select = elem as HTMLSelectElement;
      if (select.selectedIndex !== 0 || select.value !== '') {
        select.selectedIndex = 0;
        select.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        select.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        revertedCount++;
        details.push({ field: identifier, restoredValue: '' });
      }
    }
  }

  return {
    success: true,
    revertedCount,
    action: 'cleared',
    details,
  };
}

/**
 * Captures the pre-fill state, keeping the originally captured value of any field
 * already in the snapshot so that filling twice and then undoing restores the
 * user's own values instead of the first fill's values.
 */
function captureUndoSnapshot(root: Document | HTMLElement | ShadowRoot): void {
  const fresh = captureFormSnapshot(root);
  if (!lastFormSnapshot) {
    lastFormSnapshot = fresh;
    return;
  }
  const kept = lastFormSnapshot.fields.filter((f) => f.element.isConnected);
  const known = new Set(kept.map((f) => f.element));
  lastFormSnapshot = {
    timestamp: lastFormSnapshot.timestamp,
    fields: [...kept, ...fresh.fields.filter((f) => !known.has(f.element))],
  };
}

/**
 * Fills one field, isolating failures so a single hostile or unusual control
 * (e.g. a framework that throws from its setter) cannot abort the whole fill.
 */
function tryFillField(
  field: DetectedField,
  fieldType: SupportedFieldType,
  person: SyntheticPerson,
  options: FillOptions,
  details: FillResult['details'],
  addressScope = field.addressScope
): boolean {
  try {
    const targetScript = field.script || options.fillScript || options.script || 'en';
    return fillFieldElement(field.element, fieldType, person, field.name || field.id, details, targetScript, addressScope);
  } catch {
    return false;
  }
}

/**
 * Fills detected fields on the webpage using the synthetic person and user options.
 * Runs 100% offline using local heuristic rule engine and domain-specific rules.
 */
export function fillPage(
  person: SyntheticPerson,
  options: FillOptions,
  root: Document | HTMLElement | ShadowRoot = document,
  domainRules: FieldMappingRule[] = []
): FillResult {
  captureUndoSnapshot(root);

  const detected = scanFormFields(root);
  const details: FillResult['details'] = [];
  let fieldsFilledCount = 0;

  for (const field of detected) {
    // 1. Check custom domain mapping overrides first (Highest priority!)
    const rule = matchDomainRule(field.element, domainRules);
    const resolvedType = rule ? rule.targetType : field.type;

    if (!isCategoryEnabled(resolvedType, options)) {
      continue;
    }

    if (tryFillField(field, resolvedType, person, options, details)) {
      fieldsFilledCount++;
    }
  }

  return {
    success: true,
    fieldsFilledCount,
    details,
  };
}

export type FieldClassifier = (payload: FieldClassificationPayload) => Promise<ClassificationResult>;

/** Upper bound on AI lookups per fill so a huge page cannot burn through the user's quota. */
const MAX_AI_CLASSIFICATIONS_PER_FILL = 25;

/**
 * Asynchronous page filler that executes:
 * 1. Custom Domain Mapping Overrides (Highest priority)
 * 2. Local Heuristic Detection
 * 3. Optional AI classification for unhandled unknowns
 *
 * `classify` lets the content script route classification through the background
 * service worker; when omitted, the provider is called directly with `aiConfig`.
 */
export async function fillPageAsync(
  person: SyntheticPerson,
  options: FillOptions,
  aiConfig?: AiConfig,
  root: Document | HTMLElement | ShadowRoot = document,
  domainRules: FieldMappingRule[] = [],
  classify?: FieldClassifier
): Promise<FillResult> {
  captureUndoSnapshot(root);

  const detected = scanFormFields(root);
  const details: FillResult['details'] = [];
  let fieldsFilledCount = 0;
  const unhandledUnknowns: DetectedField[] = [];

  for (const field of detected) {
    // 1. Check custom domain mapping overrides first (Highest priority!)
    const rule = matchDomainRule(field.element, domainRules);
    if (rule) {
      if (isCategoryEnabled(rule.targetType, options) && tryFillField(field, rule.targetType, person, options, details)) {
        fieldsFilledCount++;
      }
      continue;
    }

    // 2. Rule-based local heuristic detector
    const isConfident = field.type !== 'unknown' && (field.type !== 'text' || field.confidence > 0.4);
    if (isConfident) {
      if (isCategoryEnabled(field.type, options) && tryFillField(field, field.type, person, options, details)) {
        fieldsFilledCount++;
      }
    } else {
      unhandledUnknowns.push(field);
    }
  }

  // 3. Optional AI classification for remaining unhandled fields
  const classifier: FieldClassifier | undefined =
    classify ||
    (aiConfig?.enabled
      ? async (payload) => {
          const { classifyUnknownField } = await import('../services/aiClassifier');
          return classifyUnknownField(payload, aiConfig);
        }
      : undefined);

  if (options.enableAiClassification && classifier && unhandledUnknowns.length > 0) {
    const domain =
      typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'localhost';
    const batch = unhandledUnknowns.slice(0, MAX_AI_CLASSIFICATIONS_PER_FILL);

    const classifications = await Promise.all(
      batch.map((field) => {
        const elem = field.element as HTMLInputElement;
        return classifier({
          domain,
          name: field.name,
          id: field.id,
          placeholder: elem.placeholder,
          label: field.label,
          type: elem.getAttribute('type') || elem.tagName.toLowerCase(),
        }).catch((): ClassificationResult => ({ fieldType: 'unknown', confidence: 0 }));
      })
    );

    batch.forEach((field, i) => {
      const { fieldType } = classifications[i];
      if (fieldType !== 'unknown' && isCategoryEnabled(fieldType, options) && tryFillField(field, fieldType, person, options, details)) {
        fieldsFilledCount++;
      }
    });
  }

  return {
    success: true,
    fieldsFilledCount,
    details,
  };
}

/**
 * Fills a single DOM element using synthetic person data and options.
 */
export function fillSingleField(
  element: HTMLElement,
  person: SyntheticPerson,
  options?: Partial<FillOptions>,
  domainRules: FieldMappingRule[] = []
): boolean {
  captureUndoSnapshot(element.closest('form') || element.ownerDocument || document);

  const rule = matchDomainRule(element, domainRules);
  const detected = detectFieldType(element);
  const resolvedType = rule ? rule.targetType : detected.type;

  const targetScript = detected.script || options?.fillScript || options?.script || 'en';
  const details: FillResult['details'] = [];

  try {
    return fillFieldElement(
      element,
      resolvedType,
      person,
      element.getAttribute('name') || element.id,
      details,
      targetScript,
      detected.addressScope
    );
  } catch {
    return false;
  }
}
