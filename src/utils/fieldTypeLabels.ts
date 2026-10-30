import { SupportedFieldType } from '../types';
import { VALID_FIELD_TYPES } from '../services/aiClassifier';

const LABELS: Partial<Record<SupportedFieldType, string>> = {
  fullName: 'Full name',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  gender: 'Gender',
  dateOfBirth: 'Date of birth (AD)',
  dateOfBirthBS: 'Date of birth (BS)',
  dateBS: 'Date (BS)',
  age: 'Age',
  bloodGroup: 'Blood group',
  email: 'Email',
  phone: 'Mobile number',
  telephone: 'Landline',
  province: 'Province',
  district: 'District',
  municipality: 'Municipality',
  ward: 'Ward',
  tole: 'Tole / street',
  address: 'Full address',
  permanentAddress: 'Permanent address',
  temporaryAddress: 'Temporary address',
  occupation: 'Occupation',
  jobTitle: 'Job title',
  department: 'Department',
  companyName: 'Company',
  username: 'Username',
  password: 'Password',
  studentId: 'Student ID / roll no.',
  school: 'School / college',
  grade: 'Grade / level',
  faculty: 'Faculty',
  guardianName: 'Guardian name',
  guardianPhone: 'Guardian phone',
  employeeId: 'Employee ID',
  salary: 'Salary',
  panNumber: 'PAN number',
  vatNumber: 'VAT number',
  businessName: 'Business name',
  businessType: 'Business type',
  designation: 'Designation',
  subject: 'Subject',
  citizenshipNumber: 'Citizenship number',
  citizenshipIssueDistrict: 'Citizenship issue district',
  citizenshipIssueDateBS: 'Citizenship issue date (BS)',
  nationalId: 'National ID (NID)',
  passportNumber: 'Passport number',
  drivingLicenseNumber: 'Driving licence number',
  bankName: 'Bank name',
  bankBranch: 'Bank branch',
  bankAccountNumber: 'Bank account number',
  bankAccountName: 'Account holder name',
  esewaId: 'eSewa ID',
  khaltiId: 'Khalti ID',
  referenceNumber: 'Reference number',
  number: 'Number',
  date: 'Date',
  text: 'Generic text',
  textarea: 'Long text',
  url: 'Website URL',
  unknown: 'Skip this field',
};

export function fieldTypeLabel(type: SupportedFieldType | string): string {
  return LABELS[type as SupportedFieldType] || type;
}

/** Field types a user can map a field to, sorted by label, with "skip" first. */
export const MAPPABLE_FIELD_TYPES: SupportedFieldType[] = [
  'unknown',
  ...VALID_FIELD_TYPES.filter((t) => t !== 'unknown').sort((a, b) =>
    fieldTypeLabel(a).localeCompare(fieldTypeLabel(b))
  ),
];
