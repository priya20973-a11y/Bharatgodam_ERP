// Test script to validate month-end billing day logic
const { calculateStorageDays } = require('./lib/storage-engine.ts');

console.log('=== Test Case 1: Ends on month end (2026-03-31) ===');
const days1 = calculateStorageDays('2026-03-21', '2026-03-31', 'COMPLETED');
console.assert(days1 === 11, `Expected 11 days, got ${days1}`);

console.log('=== Test Case 2: Not month end (2026-03-28) ===');
const days2 = calculateStorageDays('2026-03-21', '2026-03-28', 'COMPLETED');
console.assert(days2 === 8, `Expected 8 days, got ${days2}`);

console.log('=== Test Case 3: Full month invoice period (2026-04-01 to 2026-04-30) ===');
const days3 = calculateStorageDays('2026-04-01', '2026-04-30', 'COMPLETED');
console.assert(days3 === 30, `Expected 30 days, got ${days3}`);

console.log('=== Test Case 4: Single day on month end (2026-03-31) ===');
const days4 = calculateStorageDays('2026-03-31', '2026-03-31', 'COMPLETED');
console.assert(days4 === 1, `Expected 1 day, got ${days4}`);

console.log('✅ All tests passed!');
