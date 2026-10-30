import { DetectedField, SupportedFieldType } from '../types';
import { toEnglishNumerals } from '../generator/numerals';

/**
 * Extracts the most relevant human-readable label from the DOM for an input element.
 */
export function getFieldLabel(element: HTMLElement): string {
  const rootNode = (element.getRootNode ? element.getRootNode() : document) as Document | ShadowRoot;

  // 1. Explicit <label for="id">
  if (element.id) {
    const labelElem =
      (rootNode.querySelector && rootNode.querySelector(`label[for="${CSS.escape(element.id)}"]`)) ||
      (typeof document !== 'undefined' && document.querySelector ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null);
    if (labelElem && labelElem.textContent) {
      return labelElem.textContent.trim();
    }
  }

  // 2. Enclosing <label>
  const parentLabel = element.closest ? element.closest('label') : null;
  if (parentLabel && parentLabel.textContent) {
    return parentLabel.textContent.trim();
  }

  // 3. aria-label or aria-labelledby
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.trim();
  }

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelledByElem =
      (rootNode.getElementById && rootNode.getElementById(ariaLabelledBy)) ||
      (rootNode.querySelector && rootNode.querySelector(`#${CSS.escape(ariaLabelledBy)}`)) ||
      (typeof document !== 'undefined' && document.getElementById ? document.getElementById(ariaLabelledBy) : null);
    if (labelledByElem && labelledByElem.textContent) {
      return labelledByElem.textContent.trim();
    }
  }

  // 4. aria-describedby
  const ariaDescribedBy = element.getAttribute('aria-describedby');
  if (ariaDescribedBy) {
    const describedByElem =
      (rootNode.getElementById && rootNode.getElementById(ariaDescribedBy)) ||
      (rootNode.querySelector && rootNode.querySelector(`#${CSS.escape(ariaDescribedBy)}`)) ||
      (typeof document !== 'undefined' && document.getElementById ? document.getElementById(ariaDescribedBy) : null);
    if (describedByElem && describedByElem.textContent && describedByElem.textContent.length < 80) {
      return describedByElem.textContent.trim();
    }
  }

  // 5. Preceding sibling label or span
  const prevSibling = element.previousElementSibling;
  if (prevSibling && prevSibling.textContent && prevSibling.textContent.length < 60) {
    return prevSibling.textContent.trim();
  }

  // 6. Parent container header or label (e.g. Bootstrap/Tailwind form-group, MUI floating label, fieldset legend)
  const container = element.closest('.form-group, .form-field, .input-group, .field, fieldset, div');
  if (container) {
    const innerLabel = container.querySelector('label, .form-label, .label, legend');
    if (innerLabel && innerLabel.textContent && innerLabel !== element) {
      return innerLabel.textContent.trim();
    }
  }

  return '';
}

/**
 * Normalizes text by separating punctuation, splitting camelCase, and trimming.
 */
export function normalizeSignals(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._\-\/\\:,;]/g, ' ')
    .toLowerCase()
    .trim();
}

interface MatchRule {
  type: SupportedFieldType;
  regex: RegExp;
  baseConfidence: number;
}

/**
 * Comprehensive dictionary of Romanized Nepali, Devanagari, and English form field patterns.
 */
const PATTERN_RULES: MatchRule[] = [
  // 1. Password
  {
    type: 'password',
    regex: /(?:\b(password|pwd|passcode|secret)\b|गोप्य\s*शब्द)/i,
    baseConfidence: 0.99,
  },

  // 2. Email
  {
    type: 'email',
    regex: /(?:\b(email|e\s*mail|mail)\b|विद्युतीय\s*डाक|इमेल|ईमेल)/i,
    baseConfidence: 0.98,
  },

  // 3. Identification (PAN, VAT, National ID, Citizenship, Passport, Driving License)
  {
    type: 'citizenshipIssueDistrict',
    regex: /(?:\b(citizenship\s*(issue|issued)?\s*district|nagrikta\s*jari\s*jilla|citizenship\s*district)\b|नागरिकता\s*जारी\s*जिल्ला|नागरिकता\s*लिएको\s*जिल्ला)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'citizenshipIssueDateBS',
    regex: /(?:\b(citizenship\s*(issue|issued)?\s*date\s*bs|citizenship\s*date\s*bs|nagrikta\s*jari\s*miti\s*bs|citizenship\s*issue\s*date|citizenship\s*issued\s*date|nagrikta\s*jari\s*miti)\b|नागरिकता\s*जारी\s*मिति|नागरिकता\s*लिएको\s*मिति)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'citizenshipIssuedBy',
    regex: /(?:\b(citizenship\s*(issue|issued)?\s*by|citizenship\s*issuing\s*authority|nagrikta\s*jari\s*garne\s*(karyalaya|nikaya)?|nagrikta\s*karyalaya)\b|नागरिकता\s*जारी\s*गर्ने\s*(कार्यालय|निकाय|अधिकारी)|नागरिकता\s*कार्यालय|जिल्ला\s*प्रशासन\s*कार्यालय)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'citizenshipNumber',
    regex: /(?:\b(citizenship\s*(no|number|num)?|nagrikta\s*(no|num|number)?)\b|नागरिकता\s*नं|नागरिकता\s*नम्बर)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'nationalId',
    regex: /(?:\b(national\s*id|nid\s*(no|num|number)?|rastriya\s*parichayapatra)\b|राष्ट्रिय\s*परिचयपत्र\s*नं|राष्ट्रिय\s*परिचयपत्र\s*नम्बर|राष्ट्रिय\s*परिचयपत्र)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'passportIssueDate',
    regex: /(?:\b(passport\s*(issue|issued)?\s*date|rahadani\s*jari\s*miti)\b|राहदानी\s*जारी\s*मिति|पासपोर्ट\s*जारी\s*मिति)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'passportExpiryDate',
    regex: /(?:\b(passport\s*(expiry|expiration|validity|valid\s*until|valid\s*upto)?\s*date|passport\s*expiry|rahadani\s*samapta\s*miti|passport\s*valid\s*till)\b|राहदानी\s*बहाल\s*रहने\s*अवधि|राहदानी\s*समाप्त\s*मिति|पासपोर्ट\s*म्याद)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'passportIssuedBy',
    regex: /(?:\b(passport\s*(issue|issued)?\s*by|passport\s*issuing\s*authority|rahadani\s*jari\s*garne\s*(karyalaya|nikaya)?)\b|राहदानी\s*जारी\s*गर्ने\s*(कार्यालय|निकाय|अधिकारी)|राहदानी\s*विभाग)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'passportNumber',
    regex: /(?:\b(passport\s*(no|number|num)?|mrp\s*(no|number)?|rahadani\s*(no|number|num)?)\b|राहदानी\s*नं|राहदानी\s*नम्बर|पासपोर्ट\s*नं|पासपोर्ट\s*नम्बर)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'drivingLicenseCategory',
    regex: /(?:\b(driving\s*licen[sc]e\s*category|licen[sc]e\s*category|sawari\s*chalak\s*ijajatpatra\s*barga)\b|सवारी\s*चालक\s*अनुमतिपत्र\s*वर्ग|लाइसेन्स\s*वर्ग|अनुमतिपत्र\s*वर्ग)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'drivingLicenseNumber',
    regex: /(?:\b(driving\s*licen[sc]e\s*(no|number|num)?|licen[sc]e\s*(no|number|num)?|sawari\s*chalak\s*ijajatpatra\s*(no|num|number)?|dotm\s*licen[sc]e)\b|सवारी\s*चालक\s*अनुमतिपत्र\s*नं|सवारी\s*चालक\s*अनुमतिपत्र\s*नम्बर|ड्राइभिङ\s*लाइसेन्स\s*नं|लाइसेन्स\s*नम्बर)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'vatNumber',
    regex: /(?:\b(vat\s*(no|number|num)?)\b|मूल्य\s*अभिवृद्धि\s*कर|भ्याट)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'panNumber',
    regex: /(?:\b(pan\s*(no|number|num)?|sthayi\s*lekha)\b|स्थायी\s*लेखा|प्यान)/i,
    baseConfidence: 0.95,
  },

  // 3.1 FinTech, Banking & Digital Wallets
  {
    type: 'bankAccountNumber',
    regex: /(?:\b(account\s*(no|number|num)|bank\s*acc(ount)?\s*(no|number|num)?|khata\s*(no|number|num))\b|खाता\s*नं|खाता\s*नम्बर|बैंक\s*खाता\s*नं|बैंक\s*खाता\s*नम्बर)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'bankAccountName',
    regex: /(?:\b(account\s*holder(\s*name)?|acc(ount)?\s*name|khatawala(\s*ko)?\s*naam)\b|खातावालाको\s*नाम|खातावाल\s*नाम|खाताको\s*नाम)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'bankBranch',
    regex: /(?:\b(bank\s*branch|branch\s*name|branch)\b|बैंक\s*शाखा|शाखा(को)?\s*नाम)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'bankName',
    regex: /(?:\b(bank\s*name|commercial\s*bank|bank_name|bankname|bank)\b|बैंकको\s*नाम|बैंक\s*नाम|वाणिज्य\s*बैंक)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'esewaId',
    regex: /(?:\b(esewa\s*(id|no|num|number)?|e-sewa\s*(id|no|num|number)?)\b|ईसेवा(\s*आइडी)?|इसेवा(\s*आइडी)?)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'khaltiId',
    regex: /(?:\b(khalti\s*(id|no|num|number)?)\b|खल्ती(\s*आइडी)?)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'bloodGroup',
    regex: /(?:\b(blood\s*group|blood\s*grp|blood\s*type|bloodgroup|bloodtype|bgroup|ragat\s*samuha|blood)\b|रक्त\s*समूह|ब्लड\s*ग्रुप)/i,
    baseConfidence: 0.98,
  },

  // 4. Telephone / Landline
  {
    type: 'telephone',
    regex: /(?:\b(telephone|landline|durvasa|tel\s*(no|num|number)?)\b|टेलिफोन|स्थानीय\s*फोन)/i,
    baseConfidence: 0.96,
  },

  // 5. Mobile / Phone
  {
    type: 'phone',
    regex: /(?:\b(mobile|cell|cellphone|phone|contact\s*(no|num|number)?|chalbhasa|samparka)\b|मोबाइल|फोन|सम्पर्क\s*नम्बर|ह्वाट्सएप)/i,
    baseConfidence: 0.95,
  },

  // 6. Student & Academic attributes
  {
    type: 'studentId',
    regex: /(?:\b(student\s*id|roll\s*(no|num|number)?|symbol\s*no|registration\s*(no|num|number)?|reg\s*no)\b|विद्यार्थी\s*नं|रोल\s*नं)/i,
    baseConfidence: 0.94,
  },
  {
    type: 'guardianPhone',
    regex: /(?:\b(guardian\s*(phone|mobile|contact)|abhibhavak\s*samparka)\b|अभिभावक\s*सम्पर्क)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'guardianName',
    regex: /(?:\b(guardian\s*name|guardian|abhibhavak|baba\s*buwa|aama)\b|अभिभावक(\s*नाम)?)/i,
    baseConfidence: 0.94,
  },
  {
    type: 'school',
    regex: /(?:\b(school|college|campus|university|vidhyalaya|shikshan\s*sanstha)\b|विद्यालय|कलेज|क्याम्पस|विश्वविद्यालय)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'faculty',
    regex: /(?:\b(faculty|stream|academic\s*stream|shankaay)\b|संकाय|अध्ययन\s*संकाय)/i,
    baseConfidence: 0.93,
  },
  {
    type: 'grade',
    regex: /(?:\b(grade|class|level|semester|kaksha|taha|shreni)\b|कक्षा|तह|श्रेणी|सेमेस्टर)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'subject',
    regex: /(?:\b(subject|discipline|course|vishaya)\b|विषय)/i,
    baseConfidence: 0.91,
  },

  // 7. Corporate, Employment & Agriculture
  {
    type: 'employeeId',
    regex: /(?:\b(employee\s*id|emp\s*id|staff\s*id|badge\s*no)\b|कर्मचारी\s*परिचयपत्र|कर्मचारी\s*नं)/i,
    baseConfidence: 0.94,
  },
  {
    type: 'salary',
    regex: /(?:\b(salary|income|remuneration|pay|ctc|wages|talab|aamdani|aaya)\b|तलब|मासिक\s*तलब|आम्दानी|पारिश्रमिक|आयस्रोत)/i,
    baseConfidence: 0.94,
  },
  {
    type: 'businessName',
    regex: /(?:\b(business\s*name|firm\s*name|enterprise|byawasaya\s*naam)\b|व्यवसाय(को)?\s*नाम|फर्मको\s*नाम)/i,
    baseConfidence: 0.93,
  },
  {
    type: 'businessType',
    regex: /(?:\b(business\s*type|firm\s*type|registration\s*type|entity\s*type)\b|व्यवसायको\s*प्रकार|फर्मको\s*प्रकार)/i,
    baseConfidence: 0.93,
  },
  {
    type: 'cooperative',
    regex: /(?:\b(cooperative|co\s*operative|sahakari)\b|सहकारी|कृषि\s*सहकारी)/i,
    baseConfidence: 0.93,
  },
  {
    type: 'cropType',
    regex: /(?:\b(crop|crop\s*type|crop\s*name|produce|baali|fasal)\b|बाली|मुख्य\s*बाली|फसल|उत्पादन)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'designation',
    regex: /(?:\b(designation|job\s*title|position|post|rank|pad)\b|पद|ओहोदा)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'department',
    regex: /(?:\b(department|dept|division|shakha|karyalay)\b|शाखा|विभाग)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'occupation',
    regex: /(?:\b(occupation|profession|pesha|byawasaya|rojgari)\b|पेशा|व्यवसाय|रोजगारी)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'companyName',
    regex: /(?:\b(company|organization|organisation|employer|workplace|sanstha)\b|संस्था|कम्पनी|रोजगारदाता)/i,
    baseConfidence: 0.91,
  },

  // 8. Date of Birth (BS & AD), Split BS Date & Age
  {
    type: 'dateOfBirthBS',
    regex: /(?:\b(dob\s*bs|birth\s*date\s*bs|bs\s*dob|janma\s*miti\s*bs)\b|जन्म\s*मिति\s*\(?वि\.?\s*सं\.?\)?|वि\.?\s*सं\.?\s*जन्म\s*मिति)/i,
    baseConfidence: 0.98,
  },
  {
    type: 'dateBS',
    regex: /(?:\b(bs\s*date|date\s*bs|date_bs|bs_date|nepali\s*date|nepali_date|bsdate|nepalidate|miti\s*bs)\b|वि\.?\s*सं\.?\s*मिति|मिति\s*\(?वि\.?\s*सं\.?\)?|नेपाली\s*मिति)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'bsYear',
    regex: /(?:\b(bs\s*year|year\s*bs|birth\s*year\s*bs|bs\s*saal|saal\s*bs|year_bs|bs_year|bsyear|birthyearbs|dob_year_bs|year\(bs\))\b|वि\.?\s*सं\.?\s*(?:वर्ष|साल)|(?:वर्ष|साल)\s*\(?वि\.?\s*सं\.?\)?|विक्रम\s*संवत\s*(?:वर्ष|साल))/i,
    baseConfidence: 0.96,
  },
  {
    type: 'bsMonth',
    regex: /(?:\b(bs\s*month|month\s*bs|birth\s*month\s*bs|bs\s*mahina|mahina\s*bs|month_bs|bs_month|bsmonth|birthmonthbs|dob_month_bs|month\(bs\))\b|वि\.?\s*सं\.?\s*महिना|महिना\s*\(?वि\.?\s*सं\.?\)?|विक्रम\s*संवत\s*महिना)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'bsDay',
    regex: /(?:\b(bs\s*day|day\s*bs|birth\s*day\s*bs|bs\s*gatey|gatey\s*bs|gati\s*bs|bs\s*gati|day_bs|bs_day|bsday|birthdaybs|dob_day_bs|day\(bs\)|gatey|gati)\b|वि\.?\s*सं\.?\s*(?:गते|दिन)|(?:गते|दिन)\s*\(?वि\.?\s*सं\.?\)?|गते)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'dateOfBirth',
    regex: /(?:\b(dob|birth\s*date|date\s*of\s*birth|birth\s*day|janma\s*miti|janma\s*darta)\b|जन्म\s*मिति|जन्ममिति)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'age',
    regex: /(?:\b(age|umar|umer)\b|उमेर)/i,
    baseConfidence: 0.90,
  },

  // 9. Gender
  {
    type: 'gender',
    regex: /(?:\b(gender|sex|linga|ling)\b|लिङ्ग)/i,
    baseConfidence: 0.95,
  },

  // 10. Name (First, Middle, Last, Full)
  {
    type: 'firstName',
    regex: /(?:\b(first\s*name|given\s*name|fname|pahilo\s*naam|pehelo\s*naam)\b|पहिलो\s*नाम)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'middleName',
    regex: /(?:\b(middle\s*name|mname|bichko\s*naam)\b|बीचको\s*नाम)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'lastName',
    regex: /(?:\b(last\s*name|surname|family\s*name|lname|thar|upanam)\b|थर|उपनाम)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'fullName',
    regex: /(?:\b(full\s*name|your\s*name|applicant\s*name|customer\s*name|employee\s*name|pura\s*naam|purna\s*naam|nepali\s*name|^name$)\b|नाम\s*थर|पूरा\s*नाम|नाम\s*\(?नेपालीमा\)?|^नाम$|\bनाम\b)/i,
    baseConfidence: 0.90,
  },

  // 10.5 Same as Permanent Checkbox
  {
    type: 'sameAsPermanent',
    regex: /(?:\b(same\s*as\s*(?:perm|permanent|sthayi|sthayee)|sameaspermanent|same_as_permanent|same_as_perm|same_perm|copy_permanent|same_address|sthayi_saraha|sthayee_sara)\b|स्थायी\s*(?:ठेगाना\s*)?(?:अनुसार|जस्तै|सरह)|हालको\s*ठेगाना\s*स्थायी\s*सरह)/i,
    baseConfidence: 0.98,
  },

  // 11. Nepal Address Components (Permanent vs Temporary & Generic)
  {
    type: 'permanentAddress',
    regex: /(?:\b(permanent\s*address|perm\s*address|permanent_thegana|sthayee_address)\b|मूल\s*ठेगाना)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'temporaryAddress',
    regex: /(?:\b(temporary\s*address|temp\s*address|current\s*address|present\s*address|temp_thegana)\b)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'permanentProvince',
    regex: /(?:\b(?:permanent|perm|sthayi|sthayee)\s*(?:province|pradesh|state)\b|(?<!अ)स्थायी\s*प्रदेश)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'temporaryProvince',
    regex: /(?:\b(?:temporary|temp|current|present|asthayi|asthyee|halko)\s*(?:province|pradesh|state)\b|अस्थायी\s*प्रदेश|हालको\s*प्रदेश)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'permanentDistrict',
    regex: /(?:\b(?:permanent|perm|sthayi|sthayee)\s*(?:district|jilla|zila)\b|(?<!अ)स्थायी\s*जिल्ला)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'temporaryDistrict',
    regex: /(?:\b(?:temporary|temp|current|present|asthayi|asthyee|halko)\s*(?:district|jilla|zila)\b|अस्थायी\s*जिल्ला|हालको\s*जिल्ला)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'permanentMunicipality',
    regex: /(?:\b(?:permanent|perm|sthayi|sthayee)\s*(?:municipality|nagarpalika|gaupalika|metro|local\s*level)\b|(?<!अ)स्थायी\s*(?:नगरपालिका|गाउँपालिका|महानगरपालिका|उपमहानगरपालिका|स्थानीय\s*तह))/i,
    baseConfidence: 0.97,
  },
  {
    type: 'temporaryMunicipality',
    regex: /(?:\b(?:temporary|temp|current|present|asthayi|asthyee|halko)\s*(?:municipality|nagarpalika|gaupalika|metro|local\s*level)\b|अस्थायी\s*(?:नगरपालिका|गाउँपालिका|महानगरपालिका|उपमहानगरपालिका|स्थानीय\s*तह)|हालको\s*(?:नगरपालिका|गाउँपालिका|महानगरपालिका|उपमहानगरपालिका|स्थानीय\s*तह))/i,
    baseConfidence: 0.97,
  },
  {
    type: 'permanentWard',
    regex: /(?:\b(?:permanent|perm|sthayi|sthayee)\s*(?:ward|wada)\b|(?<!अ)स्थायी\s*वडा)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'temporaryWard',
    regex: /(?:\b(?:temporary|temp|current|present|asthayi|asthyee|halko)\s*(?:ward|wada)\b|अस्थायी\s*वडा|हालको\s*वडा)/i,
    baseConfidence: 0.97,
  },
  {
    type: 'permanentTole',
    regex: /(?:\b(?:permanent|perm|sthayi|sthayee)\s*(?:tole|chowk|street|road|marga)\b|(?<!अ)स्थायी\s*टोल)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'temporaryTole',
    regex: /(?:\b(?:temporary|temp|current|present|asthayi|asthyee|halko)\s*(?:tole|chowk|street|road|marga)\b|अस्थायी\s*टोल|हालको\s*टोल)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'province',
    regex: /(?:\b(province|pradesh|state|rajya)\b|प्रदेश)/i,
    baseConfidence: 0.95,
  },
  {
    // Nepali forms (passport, citizenship) expect the birth district here.
    type: 'district',
    regex: /(?:\b(place\s*of\s*birth|birth\s*place|birthplace|pob|janma\s*sthan)\b|जन्म\s*स्थान|जन्मस्थान)/i,
    baseConfidence: 0.96,
  },
  {
    type: 'district',
    regex: /(?:\b(district|jilla|zila)\b|जिल्ला)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'municipality',
    regex: /(?:\b(municipality|nagarpalika|gaupalika|metro|sub\s*metro|local\s*level)\b|नगरपालिका|गाउँपालिका|महानगरपालिका|उपमहानगरपालिका|स्थानीय\s*तह)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'ward',
    regex: /(?:\b(ward|wada|ward\s*no|wada\s*no)\b|वडा|वडा\s*नं)/i,
    baseConfidence: 0.95,
  },
  {
    type: 'tole',
    regex: /(?:\b(tole|chowk|street|road|marga|bato)\b|टोल|चौक|मार्ग)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'address',
    regex: /(?:\b(address|thegana|location|sthayi\s*thegana|asthayi\s*thegana|residential\s*address|permanent\s*address|temporary\s*address)\b|ठेगाना|स्थायी\s*ठेगाना|अस्थायी\s*ठेगाना)/i,
    baseConfidence: 0.92,
  },

  // 12. General test types
  {
    type: 'username',
    regex: /(?:\b(username|user\s*id|login\s*id|handle)\b|प्रयोगकर्ता\s*नाम)/i,
    baseConfidence: 0.92,
  },
  {
    type: 'url',
    regex: /(?:\b(website|url|homepage|web\s*link)\b|साइट)/i,
    baseConfidence: 0.90,
  },
  {
    type: 'referenceNumber',
    regex: /(?:\b(ref\s*no|reference\s*(no|num|number|code)|cust\s*ref)\b|संकेत\s*नं)/i,
    baseConfidence: 0.88,
  },
];


/**
 * Autocomplete attribute direct mapping matrix.
 */
const AUTOCOMPLETE_MAP: Record<string, SupportedFieldType> = {
  name: 'fullName',
  'given-name': 'firstName',
  'additional-name': 'middleName',
  'family-name': 'lastName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'address-level1': 'province',
  'address-level2': 'district',
  'street-address': 'address',
  'current-password': 'password',
  'new-password': 'password',
  username: 'username',
  organization: 'companyName',
  'organization-title': 'jobTitle',
  bday: 'dateOfBirth',
  url: 'url',
};

const EXPLICIT_NEPALI =
  /(?:नेपालीमा|नेपाली\s*(?:युनिकोड|लिपि|भाषा)|युनिकोडमा|देवनागरी)|\b(?:in\s*nepali|nepali\s*ma|nepalima|in\s*devanagari|devanagari|nepali\s*unicode)\b/i;
const EXPLICIT_ENGLISH = /\(\s*english\s*\)|\b(?:in\s*english|english\s*ma|block\s*letters?|capital\s*letters?)\b|अंग्रेजीमा|अङ्ग्रेजीमा|अंग्रेजी|अङ्ग्रेजी/i;

/**
 * Detects whether an input field asks for a specific script.
 * - Explicit markers win: "(नेपालीमा)", "in Nepali" → np; "(English)", "in block letters" → en.
 * - A label written only in Devanagari → np.
 * - Bilingual labels such as "District (जिल्ला)" are the norm on Nepali forms and accept
 *   either script, so they return undefined and the user's chosen script applies.
 */
export function detectTargetScript(signals: {
  label: string;
  placeholder: string;
  title: string;
  name: string;
  id: string;
}): 'en' | 'np' | undefined {
  const visible = `${signals.label} ${signals.placeholder} ${signals.title}`;
  const attrs = `${signals.name} ${signals.id}`;

  if (EXPLICIT_NEPALI.test(visible)) return 'np';
  if (EXPLICIT_ENGLISH.test(visible)) return 'en';
  if (/(?:_np|_nepali|nepali_|_devanagari)\b|\bnepali_/i.test(attrs)) return 'np';

  // Judge by the label when there is one, otherwise by placeholder/title.
  const primary = signals.label.trim() || `${signals.placeholder} ${signals.title}`.trim();
  if (/[\u0900-\u097F]/.test(primary) && !/[A-Za-z]{2,}/.test(primary)) return 'np';

  return undefined;
}

/**
 * Detects whether an element belongs to Permanent or Temporary/Current address context
 * based on element signals and DOM container hierarchy.
 */
export function detectAddressScope(
  element: HTMLElement,
  signalsText: string
): 'permanent' | 'temporary' | undefined {
  // 1. Direct field signals (label, name, id, placeholder, title)
  const norm = normalizeSignals(signalsText);

  const isTemp =
    /(?:\b(temporary|temp|current|present|asthayi|asthyee|asthayee|halko|hal|corr|correspondence)\b|अस्थायी|हालको|पत्राचार)/i.test(
      norm
    ) || /(?:^|[._\-])(?:temp|curr|temporary|current|asthayi|asthyee|asthayee)(?:[._\-]|$)/i.test(signalsText);

  const isPerm =
    /(?:\b(permanent|perm|sthayi|sthayee|mool|mul)\b|(?<!अ)स्थायी|मूल)/i.test(norm) ||
    /(?:^|[._\-])(?:perm|permanent|sthayi|sthayee)(?:[._\-]|$)/i.test(signalsText);

  if (isTemp && !isPerm) return 'temporary';
  if (isPerm && !isTemp) return 'permanent';

  // 2. DOM Ancestor Traversal (Fieldset legend, card header, section classes/IDs)
  let current: HTMLElement | null = element.parentElement;
  let depth = 0;
  while (current && depth < 6 && current !== document.body) {
    if (current.tagName.toLowerCase() === 'fieldset') {
      const legend = current.querySelector('legend');
      if (legend && legend.textContent) {
        const legendNorm = normalizeSignals(legend.textContent);
        if (
          /(?:\b(temporary|temp|current|present|asthayi|asthyee|asthayee|halko)\b|अस्थायी|हालको)/i.test(
            legendNorm
          )
        ) {
          return 'temporary';
        }
        if (/(?:\b(permanent|perm|sthayi|sthayee)\b|(?<!अ)स्थायी)/i.test(legendNorm)) {
          return 'permanent';
        }
      }
    }

    const heading = current.querySelector('h1, h2, h3, h4, h5, h6, .section-title, .card-title, .title, legend');
    if (heading && heading.textContent && heading !== element) {
      const hNorm = normalizeSignals(heading.textContent);
      if (
        /(?:\b(temporary|temp|current|present|asthayi|asthyee|asthayee|halko)\b|अस्थायी|हालको)/i.test(
          hNorm
        )
      ) {
        return 'temporary';
      }
      if (/(?:\b(permanent|perm|sthayi|sthayee)\b|(?<!अ)स्थायी)/i.test(hNorm)) {
        return 'permanent';
      }
    }

    const containerSignals = `${current.id || ''} ${current.className || ''} ${
      current.getAttribute('data-section') || ''
    } ${current.getAttribute('data-name') || ''}`;
    if (containerSignals.trim()) {
      const cNorm = normalizeSignals(containerSignals);
      if (
        /(?:\b(temporary|temp|current|present|asthayi|asthyee|asthayee|halko)\b|अस्थायी|हालको)/i.test(
          cNorm
        )
      ) {
        return 'temporary';
      }
      if (/(?:\b(permanent|perm|sthayi|sthayee)\b|(?<!अ)स्थायी)/i.test(cNorm)) {
        return 'permanent';
      }
    }

    current = current.parentElement;
    depth++;
  }

  return undefined;
}

/**
 * Detects whether an element resides within a Bikram Sambat (BS) date context
 * (e.g. within a fieldset/section titled "जन्म मिति (वि.सं.)" or "Date of Birth (BS)").
 */
export function detectBsDateContext(element: HTMLElement, signalsText = ''): boolean {
  const norm = normalizeSignals(signalsText);
  if (/(?:\b(bs|bikram\s*sambat|bikram\s*samvat)\b|वि\.?\s*सं\.?|विक्रम\s*संवत|नेपाली\s*मिति)/i.test(norm)) {
    return true;
  }

  let current: HTMLElement | null = element.parentElement;
  let depth = 0;
  while (current && depth < 5 && current !== document.body) {
    if (current.tagName.toLowerCase() === 'fieldset') {
      const legend = current.querySelector('legend');
      if (legend && legend.textContent) {
        const legendNorm = normalizeSignals(legend.textContent);
        if (/(?:\b(bs|bikram\s*sambat|bikram\s*samvat)\b|वि\.?\s*सं\.?|विक्रम\s*संवत|नेपाली\s*मिति)/i.test(legendNorm)) {
          return true;
        }
      }
    }

    const heading = current.querySelector('h1, h2, h3, h4, h5, h6, .section-title, .card-title, .title, legend');
    if (heading && heading.textContent && heading !== element && !heading.contains(element)) {
      const hNorm = normalizeSignals(heading.textContent);
      if (/(?:\b(bs|bikram\s*sambat|bikram\s*samvat)\b|वि\.?\s*सं\.?|विक्रम\s*संवत|नेपाली\s*मिति)/i.test(hNorm)) {
        return true;
      }
    }

    const containerSignals = `${current.id || ''} ${current.className || ''} ${current.getAttribute('data-section') || ''}`;
    if (containerSignals.trim()) {
      const cNorm = normalizeSignals(containerSignals);
      if (/(?:\b(bs|bikram|nepali_date|nepalidate)\b|वि_?सं)/i.test(cNorm)) {
        return true;
      }
    }

    current = current.parentElement;
    depth++;
  }

  return false;
}

/**
 * Multi-Signal Scoring Engine:
 * Weighs signals across attributes (type, autocomplete, label, name, id, placeholder, surrounding context)
 * and determines the best field type with confidence.
 */
export function detectFieldType(element: HTMLElement): DetectedField {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute('role') || '';
  const inputType = (
    element.getAttribute('type') ||
    (role === 'checkbox' ? 'checkbox' : role === 'radio' ? 'radio' : role === 'combobox' ? 'combobox' : tagName === 'textarea' ? 'textarea' : 'text')
  ).toLowerCase();
  const autocomplete = (element.getAttribute('autocomplete') || '').toLowerCase().trim();
  const label = getFieldLabel(element);
  const name = element.getAttribute('name') || undefined;
  const id = element.getAttribute('id') || undefined;
  const placeholder = element.getAttribute('placeholder') || '';
  const title = element.getAttribute('title') || '';

  // For radio buttons, checkboxes, or grouped fields, check fieldset legend and radiogroup labels
  let groupLabel = '';
  const fieldset = element.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      groupLabel += ` ${legend.textContent.trim()}`;
    }
  }
  const radiogroup = element.closest('[role="radiogroup"]');
  if (radiogroup) {
    const labelledBy = radiogroup.getAttribute('aria-labelledby');
    if (labelledBy) {
      const lbl = document.getElementById(labelledBy);
      if (lbl && lbl.textContent) {
        groupLabel += ` ${lbl.textContent.trim()}`;
      }
    }
    const ariaLabel = radiogroup.getAttribute('aria-label');
    if (ariaLabel) {
      groupLabel += ` ${ariaLabel.trim()}`;
    }
  }

  const effectiveLabel = `${label} ${groupLabel}`.trim();
  const script = detectTargetScript({ label: effectiveLabel, placeholder, title, name: name || '', id: id || '' });

  // An email input only accepts an email, even when autocomplete says "username" (Google sign-in).
  if (inputType === 'email') {
    return { element, type: 'email', confidence: 0.98, label, name, id, script };
  }

  // 1. Direct autocomplete signal (Highest precedence if matched)
  if (autocomplete && AUTOCOMPLETE_MAP[autocomplete]) {
    let matchedType = AUTOCOMPLETE_MAP[autocomplete];
    // Sign-in forms mark "Email or phone" as autocomplete="username"; an email works there, a handle doesn't.
    if (matchedType === 'username' && /\be-?mail\b|इमेल|ईमेल/i.test(`${effectiveLabel} ${placeholder}`)) {
      matchedType = 'email';
    }
    const rawSignals = `${effectiveLabel} ${name || ''} ${id || ''} ${placeholder} ${title}`;
    const addressScope = detectAddressScope(element, rawSignals);
    if (addressScope === 'temporary') {
      if (matchedType === 'province') matchedType = 'temporaryProvince';
      else if (matchedType === 'district') matchedType = 'temporaryDistrict';
      else if (matchedType === 'address') matchedType = 'temporaryAddress';
    } else if (addressScope === 'permanent') {
      if (matchedType === 'province') matchedType = 'permanentProvince';
      else if (matchedType === 'district') matchedType = 'permanentDistrict';
      else if (matchedType === 'address') matchedType = 'permanentAddress';
    }

    return {
      element,
      type: matchedType,
      confidence: 0.98,
      label,
      name,
      id,
      script,
      addressScope,
    };
  }

  // 2. Direct HTML5 input type shortcuts
  if (inputType === 'password') {
    return { element, type: 'password', confidence: 0.99, label, name, id, script };
  }

  // 3. Multi-Signal Scoring across weighted channels
  const scores: Map<SupportedFieldType, number> = new Map();

  const addScore = (type: SupportedFieldType, weight: number) => {
    scores.set(type, (scores.get(type) || 0) + weight);
  };

  const signals = {
    label: normalizeSignals(effectiveLabel),
    name: normalizeSignals(name || ''),
    id: normalizeSignals(id || ''),
    placeholder: normalizeSignals(placeholder),
    title: normalizeSignals(title),
  };

  const rawCombinedSignals = `${label} ${name || ''} ${id || ''} ${placeholder} ${title}`;
  const isBsContext = detectBsDateContext(element, rawCombinedSignals);

  // Check for popular Nepali datepicker classes or attributes
  const classList = (element.className || '').toString();
  const isNepaliPickerClass =
    /(nepali-datepicker|ndp-nepali-datepicker|hasNepaliDatePicker|nepali-date|hamro-datepicker|bod-picker)/i.test(
      classList
    ) ||
    element.hasAttribute('nepali-date-picker') ||
    element.hasAttribute('data-nepali-datepicker');

  if (isNepaliPickerClass) {
    const isDob = /(?:dob|birth|janma|जन्म)/i.test(rawCombinedSignals);
    addScore(isDob ? 'dateOfBirthBS' : 'dateBS', 3.5);
  }

  // Inspect <select> options for split BS date dropdowns
  if (tagName === 'select') {
    const selectElem = element as HTMLSelectElement;
    const options = Array.from(selectElem.options);
    if (options.length > 0) {
      // Month check: check if option texts or values contain Nepali month names
      const hasBsMonthNames = options.some((opt) => {
        const txt = `${opt.text} ${opt.value}`.toLowerCase();
        return /baishakh|baisakh|बैशाख|jestha|jeth|जेठ|ashadh|asar|असार|shrawan|saun|साउन|chaitra|chait|चैत|falgun|फागुन|कार्तिक|मंसिर|भाद्र|भदौ|आश्विन|असोज|पौष|पुस|माघ/.test(
          txt
        );
      });
      if (hasBsMonthNames) {
        addScore('bsMonth', 3.5);
      }

      // Year check: check if option values are in range 2020-2090 (or २०२०-२०९०)
      const yearNums = options
        .map((opt) => parseInt(toEnglishNumerals(opt.value || opt.text).trim(), 10))
        .filter((n) => !isNaN(n));
      const hasHighBsYears = yearNums.some((n) => n >= 2065 && n <= 2095);
      const hasAnyBsYears = yearNums.some((n) => n >= 2020 && n <= 2090);

      if (hasHighBsYears || (hasAnyBsYears && isBsContext)) {
        addScore('bsYear', 3.5);
      }

      // Day check: check if option texts contain 'गते' or has 28-32 days in BS context
      const hasGatey = options.some((opt) => opt.text.includes('गते') || opt.value.includes('गते'));
      const dayNums = yearNums.filter((n) => n >= 1 && n <= 32);
      if (hasGatey || (dayNums.length >= 28 && (isBsContext || /(?:day|gatey|दिन|गते)/i.test(rawCombinedSignals)))) {
        addScore('bsDay', 3.5);
      }

      // Blood group check: check if options contain blood group patterns
      const bloodGroupOptionsCount = options.filter((opt) => {
        const valText = `${opt.text} ${opt.value}`.trim();
        return (
          /\b(A|B|AB|O)[+-]\b/i.test(valText) ||
          /(?:A|B|AB|O)\s*(?:positive|negative|\+ve|\-ve)/i.test(valText) ||
          /(?:पोजेटिभ|नेगेटिभ)/.test(valText)
        );
      }).length;
      if (bloodGroupOptionsCount >= 3) {
        addScore('bloodGroup', 3.5);
      }
    }
  }

  if (isBsContext) {
    if (/(?:year|yr|साल|वर्ष)/i.test(rawCombinedSignals)) {
      addScore('bsYear', 2.0);
    }
    if (/(?:month|mo|महिना)/i.test(rawCombinedSignals)) {
      addScore('bsMonth', 2.0);
    }
    if (/(?:day|gatey|दिन|गते)/i.test(rawCombinedSignals)) {
      addScore('bsDay', 2.0);
    }
  }

  // Evaluate against all patterns
  for (const rule of PATTERN_RULES) {
    // Label match (weight 1.0)
    if (signals.label && rule.regex.test(signals.label)) {
      addScore(rule.type, rule.baseConfidence * 1.0);
    }
    // Name match (weight 0.9)
    if (signals.name && rule.regex.test(signals.name)) {
      addScore(rule.type, rule.baseConfidence * 0.9);
    }
    // ID match (weight 0.85)
    if (signals.id && rule.regex.test(signals.id)) {
      addScore(rule.type, rule.baseConfidence * 0.85);
    }
    // Placeholder match (weight 0.8)
    if (signals.placeholder && rule.regex.test(signals.placeholder)) {
      addScore(rule.type, rule.baseConfidence * 0.8);
    }
    // Title match (weight 0.7)
    if (signals.title && rule.regex.test(signals.title)) {
      addScore(rule.type, rule.baseConfidence * 0.7);
    }
  }

  // Find candidate with maximum cumulative score
  let bestType: SupportedFieldType | null = null;
  let maxScore = 0;

  for (const [candidateType, score] of scores.entries()) {
    if (score > maxScore) {
      maxScore = score;
      bestType = candidateType;
    }
  }

  // If a specific address component (district, province, municipality, ward, tole) matched,
  // it takes precedence over a generic or compound address match (e.g. from container or "स्थायी ठेगाना - जिल्ला")
  if (
    bestType === 'address' ||
    bestType === 'permanentAddress' ||
    bestType === 'temporaryAddress' ||
    bestType === 'currentAddress'
  ) {
    const specificTypes: SupportedFieldType[] = [
      'district',
      'permanentDistrict',
      'temporaryDistrict',
      'currentDistrict',
      'province',
      'permanentProvince',
      'temporaryProvince',
      'currentProvince',
      'municipality',
      'permanentMunicipality',
      'temporaryMunicipality',
      'currentMunicipality',
      'ward',
      'permanentWard',
      'temporaryWard',
      'currentWard',
      'tole',
      'permanentTole',
      'temporaryTole',
      'currentTole',
    ];
    let bestSpecific: SupportedFieldType | null = null;
    let maxSpecificScore = 0;
    for (const t of specificTypes) {
      const s = scores.get(t) || 0;
      if (s > maxSpecificScore && s >= 0.5) {
        maxSpecificScore = s;
        bestSpecific = t;
      }
    }
    if (bestSpecific) {
      bestType = bestSpecific;
      maxScore = maxSpecificScore;
    }
  }

  // Checkbox specialization for sameAsPermanent
  if (inputType === 'checkbox' || role === 'checkbox') {
    if (
      bestType === 'sameAsPermanent' ||
      /(?:\b(same\s*as\s*(?:perm|permanent|sthayi|sthayee)|sameaspermanent|same_as_permanent|same_as_perm|same_perm|copy_permanent|same_address)\b|स्थायी\s*(?:ठेगाना\s*)?(?:अनुसार|जस्तै|सरह)|हालको\s*ठेगाना\s*स्थायी\s*सरह)/i.test(
        rawCombinedSignals
      )
    ) {
      return {
        element,
        type: 'sameAsPermanent',
        confidence: 0.98,
        label,
        name,
        id,
        script,
        addressScope: 'temporary',
      };
    }
  }

  // Address scope refinement
  const isAddressField =
    bestType === 'province' ||
    bestType === 'district' ||
    bestType === 'municipality' ||
    bestType === 'ward' ||
    bestType === 'tole' ||
    bestType === 'address' ||
    bestType === 'permanentAddress' ||
    bestType === 'temporaryAddress' ||
    bestType === 'currentAddress' ||
    bestType === 'permanentProvince' ||
    bestType === 'temporaryProvince' ||
    bestType === 'currentProvince' ||
    bestType === 'permanentDistrict' ||
    bestType === 'temporaryDistrict' ||
    bestType === 'currentDistrict' ||
    bestType === 'permanentMunicipality' ||
    bestType === 'temporaryMunicipality' ||
    bestType === 'currentMunicipality' ||
    bestType === 'permanentWard' ||
    bestType === 'temporaryWard' ||
    bestType === 'currentWard' ||
    bestType === 'permanentTole' ||
    bestType === 'temporaryTole' ||
    bestType === 'currentTole';

  let addressScope: 'permanent' | 'temporary' | undefined;
  if (isAddressField) {
    addressScope = detectAddressScope(element, rawCombinedSignals);

    if (addressScope === 'temporary') {
      if (bestType === 'province') bestType = 'temporaryProvince';
      else if (bestType === 'district') bestType = 'temporaryDistrict';
      else if (bestType === 'municipality') bestType = 'temporaryMunicipality';
      else if (bestType === 'ward') bestType = 'temporaryWard';
      else if (bestType === 'tole') bestType = 'temporaryTole';
    } else if (addressScope === 'permanent') {
      if (bestType === 'province') bestType = 'permanentProvince';
      else if (bestType === 'district') bestType = 'permanentDistrict';
      else if (bestType === 'municipality') bestType = 'permanentMunicipality';
      else if (bestType === 'ward') bestType = 'permanentWard';
      else if (bestType === 'tole') bestType = 'permanentTole';
    }
  }

  // BS Context refinement for generic date types
  if (isBsContext) {
    if (bestType === 'dateOfBirth') {
      bestType = 'dateOfBirthBS';
    } else if (bestType === 'date') {
      bestType = 'dateBS';
    }
  }

  // Confidence threshold: at least 0.50
  if (bestType && maxScore >= 0.5) {
    const normalizedConfidence = Math.min(0.99, Math.round((maxScore / 1.5) * 100) / 100);
    return {
      element,
      type: bestType,
      confidence: normalizedConfidence,
      label,
      name,
      id,
      script,
      addressScope,
    };
  }

  // 4. Fallback based on HTML5 element types
  if (inputType === 'tel') {
    return { element, type: 'phone', confidence: 0.75, label, name, id, script };
  }
  if (inputType === 'number') {
    return { element, type: 'number', confidence: 0.65, label, name, id, script };
  }
  if (inputType === 'date') {
    return { element, type: isBsContext ? 'dateBS' : 'date', confidence: 0.65, label, name, id, script };
  }
  if (inputType === 'url') {
    return { element, type: 'url', confidence: 0.75, label, name, id, script };
  }
  if (tagName === 'textarea') {
    return { element, type: 'textarea', confidence: 0.6, label, name, id, script };
  }
  if (inputType === 'checkbox') {
    return { element, type: 'text', confidence: 0.6, label, name, id, script };
  }
  if (inputType === 'radio') {
    return { element, type: 'gender', confidence: 0.6, label, name, id, script };
  }
  if (inputType === 'text') {
    return { element, type: 'text', confidence: 0.4, label, name, id, script };
  }

  return { element, type: 'unknown', confidence: 0.0, label, name, id, script };
}

const FORM_CONTROL_SELECTOR = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="reset"]):not([type="button"])' +
    ':not([type="image"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="search"])' +
    ':not([disabled]):not([readonly])',
  'textarea:not([disabled]):not([readonly])',
  'select:not([disabled])',
  '[role="checkbox"]:not([aria-disabled="true"]):not(input)',
  '[role="radio"]:not([aria-disabled="true"]):not(input)',
  '[role="combobox"]:not([aria-disabled="true"]):not(input):not(select)',
].join(', ');

/**
 * True for text-like fields the user cannot see (honeypots, collapsed sections).
 * Checkboxes, radios and selects are deliberately exempt: UI kits often hide the
 * native control and render a styled replacement that still relies on it.
 */
function isHiddenTextField(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (tag === 'select' || type === 'checkbox' || type === 'radio' || el.hasAttribute('role')) return false;
  if (el.hidden || el.closest('[hidden]')) return true;

  const view = el.ownerDocument?.defaultView;
  if (view) {
    const style = view.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }

  // Only trust layout boxes when a layout engine is present (real browsers, not jsdom).
  const docEl = el.ownerDocument?.documentElement;
  if (docEl && docEl.getClientRects().length > 0 && el.getClientRects().length === 0) return true;

  return false;
}

/**
 * Recursively traverses a DOM tree, penetrating open Shadow DOM roots to collect
 * all interactive form controls. Iframes are not traversed: the content script
 * runs in every frame (all_frames) and fills its own document.
 */
export function queryDeepFormElements(
  root: Document | HTMLElement | ShadowRoot = document,
  visited: Set<Node> = new Set()
): HTMLElement[] {
  if (!root || visited.has(root)) return [];
  visited.add(root);

  const collected: HTMLElement[] = [];

  try {
    collected.push(...Array.from(root.querySelectorAll<HTMLElement>(FORM_CONTROL_SELECTOR)));
  } catch {
    // ignore query errors
  }

  // Custom web components with open Shadow DOM
  try {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
      if (el.shadowRoot && !visited.has(el.shadowRoot)) {
        collected.push(...queryDeepFormElements(el.shadowRoot, visited));
      }
    }
  } catch {
    // ignore
  }

  return Array.from(new Set(collected)).filter((el) => !isHiddenTextField(el) && !isExtensionUi(el));
}

function isExtensionUi(el: HTMLElement): boolean {
  return Boolean(el.closest('[data-nepal-filler-ui]'));
}

/**
 * Scans the DOM tree for all active, interactive form fields,
 * including those nested in open Shadow DOM roots.
 */
export function scanFormFields(root: Document | HTMLElement | ShadowRoot = document): DetectedField[] {
  const elements = queryDeepFormElements(root);
  return elements.map(detectFieldType);
}
