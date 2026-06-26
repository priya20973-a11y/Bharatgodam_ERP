function normalizeDateToYYYYMMDD(d) {
  if (!d) return '';
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return '';

  // Let's see: if the string already has YYYY-MM-DD pattern, e.g. "2026-06-15"
  const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  // Otherwise, if it's a full string like "Mon Jun 15 2026..." or Date object:
  // We want to extract local year, month, day to avoid timezone shifts.
  // Let's check how the original date is constructed.
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const test1 = 'Mon Jun 15 2026 05:30:00 GMT+0530 (India Standard Time)';
const test2 = '2026-06-15';
const test3 = new Date('2026-06-15');

console.log('test1:', normalizeDateToYYYYMMDD(test1));
console.log('test2:', normalizeDateToYYYYMMDD(test2));
console.log('test3:', normalizeDateToYYYYMMDD(test3));
console.log('test3 toISO:', new Date(test3).toISOString().split('T')[0]);
