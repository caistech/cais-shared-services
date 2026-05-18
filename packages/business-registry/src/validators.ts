/**
 * @caistech/business-registry — Format validators.
 *
 * Deterministic validators for registration number formats. Run before any
 * registry API call to catch malformed input cheaply.
 */

import type { ValidatorResult } from './types.js';

/**
 * China — Unified Social Credit Code (统一社会信用代码).
 * 18 characters: registration_authority(1) + entity_category(1) + administrative_division(6) + organisation_code(9) + check_digit(1).
 *
 * Allowed characters: digits 0-9 + uppercase letters except I O S V Z.
 * Includes a check-digit verification.
 *
 * Reference: GB 32100-2015.
 */
export function validateUSCC(uscc: string): ValidatorResult {
  const cleaned = uscc.trim().toUpperCase();

  if (cleaned.length !== 18) {
    return { valid: false, reason: 'USCC must be exactly 18 characters' };
  }

  const allowedChars = /^[0-9ABCDEFGHJKLMNPQRTUWXY]{18}$/;
  if (!allowedChars.test(cleaned)) {
    return {
      valid: false,
      reason: 'USCC contains disallowed characters (only digits 0-9 and uppercase A-Y excluding I/O/S/V/Z are permitted)',
    };
  }

  const charValue: Record<string, number> = {
    '0': 0,  '1': 1,  '2': 2,  '3': 3,  '4': 4,  '5': 5,  '6': 6,  '7': 7,
    '8': 8,  '9': 9,  'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15,
    'G': 16, 'H': 17, 'J': 18, 'K': 19, 'L': 20, 'M': 21, 'N': 22, 'P': 23,
    'Q': 24, 'R': 25, 'T': 26, 'U': 27, 'W': 28, 'X': 29, 'Y': 30,
  };
  const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += charValue[cleaned[i]] * weights[i];
  }
  const expectedCheckValue = (31 - (sum % 31)) % 31;
  const actualCheckValue = charValue[cleaned[17]];

  if (expectedCheckValue !== actualCheckValue) {
    return {
      valid: false,
      reason: 'USCC check digit mismatch — registration number is malformed or transcribed incorrectly',
    };
  }

  return {
    valid: true,
    parsed: {
      registration_authority: cleaned.charAt(0),
      entity_category: cleaned.charAt(1),
      administrative_division: cleaned.slice(2, 8),
      organisation_code: cleaned.slice(8, 17),
      check_character: cleaned.charAt(17),
    },
  };
}

/**
 * Vietnam — Mã số thuế (MST) / Tax code.
 * 10 digits, optionally followed by a hyphen and 3 more digits for branch IDs.
 * Reference: Decree 78/2015/ND-CP.
 */
export function validateMST(mst: string): ValidatorResult {
  const cleaned = mst.trim().replace(/\s+/g, '');
  const match = cleaned.match(/^(\d{10})(-\d{3})?$/);
  if (!match) {
    return { valid: false, reason: 'MST must be 10 digits, optionally followed by -3 digits for branches' };
  }
  return { valid: true, parsed: { primary: match[1], branch: match[2]?.slice(1) ?? '' } };
}

/**
 * Malaysia — SSM company registration.
 * Older format: digits only, up to 12 chars (e.g. '202001012345').
 * Newer format: '12-digit registration number' adopted from 2019.
 * Reference: Companies Act 2016.
 */
export function validateSSM(ssm: string): ValidatorResult {
  const cleaned = ssm.trim().replace(/[\s-]/g, '');
  if (!/^\d{6,12}$/.test(cleaned)) {
    return { valid: false, reason: 'SSM registration must be 6–12 digits' };
  }
  return { valid: true, parsed: { number: cleaned } };
}

/**
 * Australia — Australian Business Number (ABN).
 * 11 digits with check-digit modulus 89 algorithm.
 */
export function validateABN(abn: string): ValidatorResult {
  const cleaned = abn.trim().replace(/\s+/g, '');
  if (!/^\d{11}$/.test(cleaned)) {
    return { valid: false, reason: 'ABN must be 11 digits' };
  }
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = cleaned.split('').map((d) => parseInt(d, 10));
  digits[0] -= 1; // ATO algorithm: subtract 1 from first digit
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  if (sum % 89 !== 0) {
    return { valid: false, reason: 'ABN check digit mismatch' };
  }
  return { valid: true, parsed: { abn: cleaned } };
}

/**
 * Indonesia — Nomor Induk Berusaha (NIB).
 * 13 digits, single-identifier business number under OSS regime.
 */
export function validateNIB(nib: string): ValidatorResult {
  const cleaned = nib.trim().replace(/\s+/g, '');
  if (!/^\d{13}$/.test(cleaned)) {
    return { valid: false, reason: 'NIB must be 13 digits' };
  }
  return { valid: true, parsed: { nib: cleaned } };
}

/**
 * Pick the right validator by country and run it.
 */
export function validateRegistrationNumber(
  country: string,
  registrationNumber: string,
): ValidatorResult {
  switch (country) {
    case 'CN':
      return validateUSCC(registrationNumber);
    case 'VN':
      return validateMST(registrationNumber);
    case 'MY':
      return validateSSM(registrationNumber);
    case 'AU':
      return validateABN(registrationNumber);
    case 'ID':
      return validateNIB(registrationNumber);
    default:
      return { valid: false, reason: `No validator available for country '${country}'` };
  }
}
