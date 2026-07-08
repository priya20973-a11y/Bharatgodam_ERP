const GUJARATI_DIGITS = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
const ENGLISH_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Converts standard English digits in a string/number to Gujarati digits.
 */
export function toGujaratiDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str.replace(/[0-9]/g, (digit) => GUJARATI_DIGITS[parseInt(digit, 10)]);
}

/**
 * Converts Gujarati digits in a string to standard English digits.
 * Useful before parsing the string into a Number.
 */
export function toEnglishDigits(value: string): string {
  if (!value) return '';
  let str = value;
  for (let i = 0; i < 10; i++) {
    const gujDigit = new RegExp(GUJARATI_DIGITS[i], 'g');
    str = str.replace(gujDigit, ENGLISH_DIGITS[i]);
  }
  return str;
}
