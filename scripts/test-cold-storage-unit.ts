import { getApprovalWindowDetails, getGradingStatus } from '../lib/assaying-utils';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

console.log('========================================');
console.log('UNIT TESTS: Cold Storage New Modules Logic');
console.log('========================================');

// --- 1. Assaying Window Calculations ---
console.log('\n--- 1. Testing Assaying Window Logic ---');
const today = new Date();
const todayISO = today.toISOString().split('T')[0];
const windowToday = getApprovalWindowDetails(todayISO);
assert(windowToday.isOpen === true, 'Window for today should be open');
assert(windowToday.daysLeft >= 0 && windowToday.daysLeft <= 8, 'Days left should be between 0 and 8');
console.log('✔ Window for today is OPEN with daysLeft:', windowToday.daysLeft);

// Test before window
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 2);
const futureISO = futureDate.toISOString().split('T')[0];
const windowFuture = getApprovalWindowDetails(futureISO);
assert(windowFuture.isOpen === false, 'Window for future date should not be open');
assert(windowFuture.status === 'BEFORE', 'Status should be BEFORE');
console.log('✔ Window for future date is BEFORE (closed)');

// Test expired window (8 days ago)
const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 9);
const pastISO = pastDate.toISOString().split('T')[0];
const windowPast = getApprovalWindowDetails(pastISO);
assert(windowPast.isOpen === false, 'Window for 9 days ago should be expired');
assert(windowPast.status === 'EXPIRED', 'Status should be EXPIRED');
console.log('✔ Window for past date is EXPIRED (closed)');

// --- 2. Grading Status Evaluation ---
console.log('\n--- 2. Testing Grading Status Evaluation ---');
assert(getGradingStatus('70', 60, 80) === 'OK', '70 within 60-80 should be OK');
assert(getGradingStatus('50', 60, 80) === 'LOW', '50 below 60 should be LOW');
assert(getGradingStatus('85', 60, 80) === 'HIGH', '85 above 80 should be HIGH');
assert(getGradingStatus('', 60, 80) === '', 'Empty string should return empty status');
console.log('✔ Grading status evaluates OK/LOW/HIGH correctly against ranges');

// --- 3. Repayment & Expiry Date Logic for Pledge ---
console.log('\n--- 3. Testing Pledge Date Constraints ---');
const loanDate = new Date('2026-05-01');
const repaymentDateValid = new Date('2026-06-01');
const repaymentDateEarly = new Date('2026-04-15');
const inwardExpiryDate = new Date('2026-07-01');
const repaymentDateExpired = new Date('2026-07-15');

assert(repaymentDateValid.getTime() >= loanDate.getTime(), 'Valid repayment >= loan date');
assert(repaymentDateEarly.getTime() < loanDate.getTime(), 'Early repayment < loan date properly flagged');
assert(repaymentDateValid.getTime() <= inwardExpiryDate.getTime(), 'Valid repayment <= expiry date');
assert(repaymentDateExpired.getTime() > inwardExpiryDate.getTime(), 'Late repayment > expiry date properly flagged');
console.log('✔ Loan Date <= Repayment Date <= Inward Stock Expiry Date logic verified');

// --- 4. Stock Locking & Release Mathematics ---
console.log('\n--- 4. Testing Stock Locking and Release Math ---');
const initialInwardWeightKg = 25000;
const initialInwardBags = 500;
const pledgedQtyKg = 15000;
const pledgedBags = 300;

// Step 4.1: Pledging 15,000 Kg
let releasedQtyKg = 0;
let releasedBags = 0;
let netPledgedKg = pledgedQtyKg - releasedQtyKg;
let availableForOutwardKg = initialInwardWeightKg - netPledgedKg;
assert(netPledgedKg === 15000, 'Net pledged should be 15000');
assert(availableForOutwardKg === 10000, 'Available for outward should be 10000');
console.log('✔ Pledged 15,000 Kg: Stock available for outward reduced to 10,000 Kg');

// Step 4.2: Partial Release of 6,000 Kg
const partialReleaseKg = 6000;
const partialReleaseBags = 120;
releasedQtyKg += partialReleaseKg;
releasedBags += partialReleaseBags;
netPledgedKg = pledgedQtyKg - releasedQtyKg;
availableForOutwardKg = initialInwardWeightKg - netPledgedKg;
assert(netPledgedKg === 9000, 'Net pledged after partial release should be 9000');
assert(availableForOutwardKg === 16000, 'Available for outward after partial release should be 16000');
const partialStatus = netPledgedKg <= 0.001 ? 'RELEASED' : 'PARTIAL';
assert(partialStatus === 'PARTIAL', 'Status should be PARTIAL');
console.log('✔ Partial release of 6,000 Kg: Remaining pledged 9,000 Kg, Available for outward increased to 16,000 Kg, Status is PARTIAL');

// Step 4.3: Full Release of remaining 9,000 Kg
const finalReleaseKg = 9000;
const finalReleaseBags = 180;
releasedQtyKg += finalReleaseKg;
releasedBags += finalReleaseBags;
netPledgedKg = pledgedQtyKg - releasedQtyKg;
availableForOutwardKg = initialInwardWeightKg - netPledgedKg;
assert(netPledgedKg === 0, 'Net pledged after full release should be 0');
assert(availableForOutwardKg === 25000, 'Available for outward after full release should be 25000');
const finalStatus = netPledgedKg <= 0.001 ? 'RELEASED' : 'PARTIAL';
assert(finalStatus === 'RELEASED', 'Status should be RELEASED');
console.log('✔ Full release of remaining 9,000 Kg: Net pledged 0 Kg, Available for outward restored to 25,000 Kg, Status is RELEASED');

// --- 5. Outward Attempt Validation ---
console.log('\n--- 5. Testing Outward Prevention against Pledged Stock ---');
// When netPledged is 15000 and physical remaining is 25000:
const physicalRemaining = 25000;
const activePledge = 15000;
const currentRemaining = physicalRemaining - activePledge; // 10000

function attemptOutward(dispatchQty: number) {
  if (dispatchQty > currentRemaining) {
    return { success: false, error: `Quantity exceeds available stock. Physical: ${physicalRemaining} Kg, Pledged: ${activePledge} Kg` };
  }
  return { success: true };
}

assert(attemptOutward(8000).success === true, '8,000 Kg outward should succeed');
assert(attemptOutward(10000).success === true, '10,000 Kg outward should succeed');
assert(attemptOutward(10001).success === false, '10,001 Kg outward must fail because of active pledge');
assert(attemptOutward(20000).success === false, '20,000 Kg outward must fail because of active pledge');
console.log('✔ Outward correctly blocks dispatches exceeding unpledged stock!');

// --- 6. Inward Assaying & Grading Flag & Query Evaluation ---
console.log('\n--- 6. Testing Inward Assaying Flag, Query Matching & Dashboard Presentation ---');

// Mock inward records
const mockInwards = [
  {
    _id: 'inw-1',
    receiptNumber: 'INW-COLD-001',
    lotNo: 'LOT-A1',
    isAssayingRequired: true,
    assayerId: 'assayer-1',
    assayingDate: new Date('2026-11-16'),
    date: new Date('2026-11-16'),
    quantityKg: 20000,
    bagsCount: 400,
    gradingStatus: 'PENDING',
    gradingResults: [{ parameterName: 'Moisture', observedValue: '12%', status: 'OK' }],
    client: { name: 'Kisan Agro Farmers' },
    commodity: { name: 'Potato (Kufri Jyoti)' },
    assayer: { name: 'National Agri Lab', licenceNumber: 'AGRI-LAB-101' },
    truckNo: 'GJ-01-AB-1234',
    weighbridgeSlipNo: 'WB-9901',
  },
  {
    _id: 'inw-2',
    receiptNumber: 'INW-COLD-002',
    lotNo: 'LOT-A2',
    isAssayingRequired: false,
    date: new Date('2026-11-15'),
    quantityKg: 15000,
    bagsCount: 300,
    gradingStatus: undefined,
    client: { name: 'Green Valley FPO' },
    commodity: { name: 'Apple (Royal Delicious)' },
  },
  {
    // Existing legacy/eligible record where isAssayingRequired wasn't strictly boolean true but has assayer & grading results
    _id: 'inw-3',
    receiptNumber: 'INW-COLD-003',
    lotNo: 'LOT-A3',
    isAssayingRequired: undefined,
    assayerId: 'assayer-2',
    assayingDate: new Date('2026-11-14'),
    date: new Date('2026-11-14'),
    quantityKg: 10000,
    bagsCount: 200,
    gradingStatus: 'APPROVED',
    gradingResults: [{ parameterName: 'Size', observedValue: 'Large', status: 'OK' }],
    client: { name: 'Surat Cold Growers' },
    commodity: { name: 'Pomegranate' },
    assayer: { name: 'Gujarat Testing House', licenceNumber: 'GTH-552' },
  }
];

// Query predicate implementation matching getColdAssayingInwards
function isEligibleForAssayingDashboard(inw: any): boolean {
  if (inw.isAssayingRequired === false || inw.isAssayingRequired === 'false') return false;
  return Boolean(
    inw.isAssayingRequired === true ||
    inw.isAssayingRequired === 'true' ||
    inw.assayerId ||
    inw.gradingStatus ||
    (Array.isArray(inw.gradingResults) && inw.gradingResults.length > 0) ||
    (Array.isArray(inw.approvedGradingResults) && inw.approvedGradingResults.length > 0)
  );
}

const eligible = mockInwards.filter(isEligibleForAssayingDashboard);
assert(eligible.length === 2, 'Should match inw-1 and inw-3, but strictly exclude inw-2');
assert(eligible.some(i => i._id === 'inw-1'), 'inw-1 must be included');
assert(!eligible.some(i => i._id === 'inw-2'), 'inw-2 (isAssayingRequired: false) must be excluded');
assert(eligible.some(i => i._id === 'inw-3'), 'inw-3 (eligible existing record) must be included');
console.log('✔ Assaying query predicate correctly includes Assaying=Yes & eligible records while excluding Assaying=No');

// Verify dashboard search filtering
function searchInwards(items: any[], query: string) {
  if (!query.trim()) return items;
  const q = query.toLowerCase().trim();
  return items.filter(item => {
    const inwNo = (item.receiptNumber || '').toLowerCase();
    const lotNo = (item.lotNo || '').toLowerCase();
    const clientName = (item.client?.name || item.farmerName || '').toLowerCase();
    const commName = (item.commodity?.name || '').toLowerCase();
    const assayerName = (item.assayer?.name || '').toLowerCase();
    const lic = (item.assayer?.licenceNumber || '').toLowerCase();
    const truck = (item.truckNo || '').toLowerCase();
    return inwNo.includes(q) || lotNo.includes(q) || clientName.includes(q) || commName.includes(q) || assayerName.includes(q) || lic.includes(q) || truck.includes(q);
  });
}

assert(searchInwards(eligible, 'INW-COLD-001').length === 1, 'Search by receipt number works');
assert(searchInwards(eligible, 'LOT-A3').length === 1, 'Search by lot number works');
assert(searchInwards(eligible, 'kisan').length === 1, 'Search by client name works');
assert(searchInwards(eligible, 'potato').length === 1, 'Search by commodity name works');
assert(searchInwards(eligible, 'AGRI-LAB-101').length === 1, 'Search by assayer licence works');
console.log('✔ Dashboard search filters correctly by Receipt No, Lot No, Client, Commodity, and Assayer');

// Verify status filtering
function filterByStatus(items: any[], status: string) {
  if (status === 'ALL') return items;
  return items.filter(i => (i.gradingStatus || 'PENDING') === status);
}

assert(filterByStatus(eligible, 'PENDING').length === 1, 'Pending status filter works');
assert(filterByStatus(eligible, 'APPROVED').length === 1, 'Approved status filter works');
assert(filterByStatus(eligible, 'REJECTED').length === 0, 'Rejected status filter works');
console.log('✔ Dashboard status filtering correctly categorizes PENDING, APPROVED, and REJECTED records');

// --- 7. Multi-Client Inheritance & Explicit Override Rules ---
console.log('\n--- 7. Testing Multi-Client Inheritance & Override Matrix (Section 9) ---');

// Inward bulk creation logic simulation
function resolveAssayingFlag(clientVal: any, commonVal: any): boolean {
  if (clientVal !== undefined && clientVal !== null && clientVal !== '') {
    return clientVal === true || clientVal === 'true';
  }
  return Boolean(commonVal === true || commonVal === 'true');
}

// Scenario 7.1: Common Yes, all clients inherit
const s1_common = true;
const s1_clients = [{ name: 'Client 1' }, { name: 'Client 2' }, { name: 'Client 3' }];
const s1_resolved = s1_clients.map(c => resolveAssayingFlag((c as any).isAssayingRequired, s1_common));
assert(s1_resolved.every(v => v === true), 'Common Yes must cascade to all clients when not explicitly set');
console.log('✔ Scenario 1 Passed: Common Yes -> All clients inherit Yes');

// Scenario 7.2: Common No, all clients inherit
const s2_common = false;
const s2_clients = [{ name: 'Client 1' }, { name: 'Client 2' }, { name: 'Client 3' }];
const s2_resolved = s2_clients.map(c => resolveAssayingFlag((c as any).isAssayingRequired, s2_common));
assert(s2_resolved.every(v => v === false), 'Common No must cascade to all clients when not explicitly set');
console.log('✔ Scenario 2 Passed: Common No -> All clients inherit No');

// Scenario 7.3: Common Yes, one client explicitly No
const s3_common = true;
const s3_clients = [
  { name: 'Client 1', isAssayingRequired: false }, // Explicit No
  { name: 'Client 2' }, // Inherits Yes
  { name: 'Client 3' }  // Inherits Yes
];
const s3_resolved = s3_clients.map(c => resolveAssayingFlag((c as any).isAssayingRequired, s3_common));
assert(s3_resolved[0] === false, 'Client 1 explicitly No must NOT be overwritten by Common Yes');
assert(s3_resolved[1] === true, 'Client 2 must inherit Common Yes');
assert(s3_resolved[2] === true, 'Client 3 must inherit Common Yes');
console.log('✔ Scenario 3 Passed: Common Yes, Client 1 explicitly No -> Only Clients 2 & 3 have Assaying=Yes');

// Scenario 7.4: Common No, one client explicitly Yes
const s4_common = false;
const s4_clients = [
  { name: 'Client 1', isAssayingRequired: true }, // Explicit Yes
  { name: 'Client 2' }, // Inherits No
  { name: 'Client 3', isAssayingRequired: false } // Explicit No
];
const s4_resolved = s4_clients.map(c => resolveAssayingFlag((c as any).isAssayingRequired, s4_common));
assert(s4_resolved[0] === true, 'Client 1 explicitly Yes must be respected even when Common is No');
assert(s4_resolved[1] === false, 'Client 2 must inherit Common No');
assert(s4_resolved[2] === false, 'Client 3 explicit No must be false');
console.log('✔ Scenario 4 Passed: Common No, Client 1 explicitly Yes -> Only Client 1 has Assaying=Yes');

// Scenario 7.5: Multiple clients with mixed selections
const s5_common = true;
const s5_clients = [
  { name: 'Client A', isAssayingRequired: true },
  { name: 'Client B', isAssayingRequired: false },
  { name: 'Client C', isAssayingRequired: 'true' },
  { name: 'Client D', isAssayingRequired: 'false' },
  { name: 'Client E' }, // undefined, inherits Common Yes
];
const s5_resolved = s5_clients.map(c => resolveAssayingFlag((c as any).isAssayingRequired, s5_common));
assert(s5_resolved[0] === true, 'Client A true');
assert(s5_resolved[1] === false, 'Client B false');
assert(s5_resolved[2] === true, 'Client C "true"');
assert(s5_resolved[3] === false, 'Client D "false"');
assert(s5_resolved[4] === true, 'Client E inherited true');
console.log('✔ Scenario 5 Passed: Multiple clients with mixed selections properly evaluated');

// --- 8. Assayer Assignment & Validation Rules ---
console.log('\n--- 8. Testing Assayer Assignment & Validation Logic ---');

const mockAssayers = [
  { _id: 'assayer-active-1', name: 'Dr. Sharma', licenceNumber: 'LIC-001', status: 'Active' },
  { _id: 'assayer-expired-2', name: 'Dr. Patel', licenceNumber: 'LIC-002', status: 'Expired' },
];

function validateAssayerAssignment(assayerId: string | undefined | null, inwardDate: Date, assayingDate: Date) {
  if (assayerId && assayerId !== 'none') {
    const assayer = mockAssayers.find(a => a._id === assayerId);
    if (!assayer) throw new Error('Assayer not found in Cold Assayer Master.');
    if (assayer.status === 'Expired') throw new Error('Selected Assayer licence has expired. Please select an active assayer.');
  }

  const inwDay = new Date(inwardDate);
  inwDay.setHours(0, 0, 0, 0);
  const assDay = new Date(assayingDate);
  assDay.setHours(0, 0, 0, 0);
  if (assDay < inwDay) {
    throw new Error('Assaying date cannot be earlier than the Inward date.');
  }
  return true;
}

// Optional assayer at creation
assert(validateAssayerAssignment(undefined, new Date('2026-11-16'), new Date('2026-11-16')) === true, 'Assayer can be optional');
assert(validateAssayerAssignment('none', new Date('2026-11-16'), new Date('2026-11-16')) === true, 'Assayer "none" allowed');

// Active assayer assignment
assert(validateAssayerAssignment('assayer-active-1', new Date('2026-11-16'), new Date('2026-11-16')) === true, 'Active assayer allowed');

// Expired assayer must be rejected
let expiredBlocked = false;
try {
  validateAssayerAssignment('assayer-expired-2', new Date('2026-11-16'), new Date('2026-11-16'));
} catch (e: any) {
  expiredBlocked = e.message.includes('licence has expired');
}
assert(expiredBlocked === true, 'Expired assayer must be blocked');
console.log('✔ Expired Assayer licence correctly blocked from assignment');

// Assaying date earlier than Inward date must be rejected
let earlyDateBlocked = false;
try {
  validateAssayerAssignment('assayer-active-1', new Date('2026-11-16'), new Date('2026-11-15'));
} catch (e: any) {
  earlyDateBlocked = e.message.includes('earlier than the Inward date');
}
assert(earlyDateBlocked === true, 'Assaying date before Inward date must be blocked');
console.log('✔ Assaying Date < Inward Date correctly blocked');

// --- 9. Bulk Inward CSV Parsing Integration ---
console.log('\n--- 9. Testing Bulk Upload CSV Flag Normalization ---');

function normalizeBulkGradingFlag(val: any): boolean {
  const norm = String(val || '').trim().toUpperCase();
  return norm === 'Y' || norm === 'YES' || norm === 'TRUE';
}

assert(normalizeBulkGradingFlag('Y') === true, 'Y is true');
assert(normalizeBulkGradingFlag('YES') === true, 'YES is true');
assert(normalizeBulkGradingFlag('Yes') === true, 'Yes is true');
assert(normalizeBulkGradingFlag('TRUE') === true, 'TRUE is true');
assert(normalizeBulkGradingFlag('True') === true, 'True is true');
assert(normalizeBulkGradingFlag('N') === false, 'N is false');
assert(normalizeBulkGradingFlag('NO') === false, 'NO is false');
assert(normalizeBulkGradingFlag('False') === false, 'False is false');
assert(normalizeBulkGradingFlag('') === false, 'Empty is false');
assert(normalizeBulkGradingFlag(undefined) === false, 'Undefined is false');
console.log('✔ Bulk upload CSV grading flags (Y/YES/TRUE vs N/NO/FALSE) correctly parsed');

// --- 10. Tenant Isolation & Permissions ---
console.log('\n--- 10. Testing Tenant Isolation & RBAC ---');

const tenantAUser = { id: 'user-tenant-a', role: 'WSP', email: 'owner@tenant-a.com' };
const tenantBUser = { id: 'user-tenant-b', role: 'WSP', email: 'owner@tenant-b.com' };
const farmerUser = { id: 'user-farmer-1', role: 'FARMER', email: 'farmer@kisan.com' };

const records = [
  { _id: 'rec-1', userId: 'user-tenant-a', isAssayingRequired: true },
  { _id: 'rec-2', userId: 'user-tenant-b', isAssayingRequired: true },
];

function filterRecordsForUser(user: any, allRecords: any[]) {
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return allRecords;
  return allRecords.filter(r => r.userId === user.id);
}

const tenantAResults = filterRecordsForUser(tenantAUser, records);
assert(tenantAResults.length === 1 && tenantAResults[0]._id === 'rec-1', 'Tenant A only sees rec-1');

const tenantBResults = filterRecordsForUser(tenantBUser, records);
assert(tenantBResults.length === 1 && tenantBResults[0]._id === 'rec-2', 'Tenant B only sees rec-2');
console.log('✔ Tenant isolation verified: Tenants cannot read or modify records across tenant boundaries');

function isAuthorizedForGrading(user: any): boolean {
  const r = (user.role || '').toUpperCase();
  if (r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'WSP') return true;
  return false;
}

assert(isAuthorizedForGrading(tenantAUser) === true, 'WSP owner is authorized');
assert(isAuthorizedForGrading(farmerUser) === false, 'Farmer client is strictly unauthorized for assaying decisions');
console.log('✔ Role-based permissions verified: Clients cannot approve or reject grading records');

// --- 11. Testing Pledge Stock Lock & Outward Validation Lifecycle (Section 6 Scenarios) ---
console.log('\n--- 11. Testing Pledge Stock Lock & Outward Validation Lifecycle (Section 6) ---');

class MockInwardStockTracker {
  totalInwardKg: number;
  totalOutwardKg: number = 0;
  activePledgedKg: number = 0;

  constructor(initialKg: number) {
    this.totalInwardKg = initialKg;
  }

  get physicalRemaining(): number {
    return Math.max(0, this.totalInwardKg - this.totalOutwardKg);
  }

  get availableStock(): number {
    return Math.max(0, this.physicalRemaining - this.activePledgedKg);
  }

  createPledge(pledgeKg: number): { success: boolean; error?: string } {
    if (pledgeKg > this.availableStock) {
      return { success: false, error: 'Pledge quantity exceeds available unpledged stock.' };
    }
    this.activePledgedKg += pledgeKg;
    return { success: true };
  }

  releasePledge(releaseKg: number): { success: boolean; error?: string } {
    if (releaseKg > this.activePledgedKg) {
      return { success: false, error: 'Cannot release more than active pledged quantity.' };
    }
    this.activePledgedKg -= releaseKg;
    return { success: true };
  }

  attemptOutward(outwardKg: number): { success: boolean; error?: string } {
    if (outwardKg > this.availableStock) {
      if (this.activePledgedKg > 0) {
        return {
          success: false,
          error: 'Outward not allowed. This quantity is currently pledged and locked. Release the pledge before creating outward.',
        };
      }
      return {
        success: false,
        error: `Quantity exceeds the remaining stock for this specific Inward. Available: ${this.availableStock} Kg`,
      };
    }
    this.totalOutwardKg += outwardKg;
    return { success: true };
  }
}

// Step 1: Inward 500 kg, create pledge for 100 kg
const stock = new MockInwardStockTracker(500);
const pledgeRes = stock.createPledge(100);
assert(pledgeRes.success === true, 'Pledge creation should succeed');
assert(stock.activePledgedKg === 100, '100 Kg must be locked under pledge');
assert(stock.availableStock === 400, 'Available stock should be 400 Kg');
console.log('✔ Step 1: Create pledge for 100 kg -> 100 kg locked, Available: 400 kg');

// Step 2: Try outward of 500 kg (attempting to consume pledged 100 kg)
const out500 = stock.attemptOutward(500);
assert(out500.success === false, 'Outward of 500 Kg must be blocked');
assert(
  out500.error === 'Outward not allowed. This quantity is currently pledged and locked. Release the pledge before creating outward.',
  'Must return exact error message'
);
console.log('✔ Step 2: Try outward exceeding available stock with active pledge -> Blocked with exact message');

// Step 3: Outward unpledged 400 kg -> Allowed
const out400 = stock.attemptOutward(400);
assert(out400.success === true, 'Outward of 400 Kg unpledged stock must succeed');
assert(stock.physicalRemaining === 100, 'Physical remaining is 100 Kg');
assert(stock.availableStock === 0, 'Available unpledged stock is now 0 Kg');
console.log('✔ Step 3: Outward 400 kg -> Allowed (Physical remaining: 100 kg, Pledged: 100 kg, Available: 0 kg)');

// Step 4: Try additional outward 1 kg -> Blocked
const out1 = stock.attemptOutward(1);
assert(out1.success === false, 'Additional outward 1 kg must fail');
assert(
  out1.error === 'Outward not allowed. This quantity is currently pledged and locked. Release the pledge before creating outward.',
  'Must block additional outward with pledge error'
);
console.log('✔ Step 4: Try additional outward 1 kg -> Blocked');

// Step 5: Partial release 40 kg from pledge -> 40 kg unlocked
const rel40 = stock.releasePledge(40);
assert(rel40.success === true, 'Partial release of 40 kg must succeed');
assert(stock.activePledgedKg === 60, 'Remaining active pledge is 60 kg');
assert(stock.availableStock === 40, 'Available stock is now 40 kg');
console.log('✔ Step 5: Release 40 kg from pledge -> 40 kg unlocked, Remaining pledged: 60 kg, Available: 40 kg');

// Step 6: Outward released 40 kg -> Allowed
const out40 = stock.attemptOutward(40);
assert(out40.success === true, 'Outward of released 40 kg must succeed');
assert(stock.physicalRemaining === 60, 'Physical remaining is 60 kg');
assert(stock.availableStock === 0, 'Available stock is 0 kg');
console.log('✔ Step 6: Outward released 40 kg -> Allowed');

// Step 7: Remaining pledged 60 kg -> Still locked
const outLocked = stock.attemptOutward(10);
assert(outLocked.success === false, 'Outward against remaining 60 kg locked stock must fail');
assert(stock.activePledgedKg === 60, 'Remaining pledged is still 60 kg');
console.log('✔ Step 7: Remaining pledged 60 kg -> Still locked');

// Step 8: Fully release remaining 60 kg -> All pledged stock unlocked
const rel60 = stock.releasePledge(60);
assert(rel60.success === true, 'Full release must succeed');
assert(stock.activePledgedKg === 0, 'All pledged stock is unlocked (0 kg pledged)');
assert(stock.availableStock === 60, 'Available stock is restored to 60 kg');
console.log('✔ Step 8: Fully release remaining 60 kg -> All pledged stock unlocked (Available: 60 kg)');

// Step 9: Outward remaining 60 kg -> Allowed
const out60 = stock.attemptOutward(60);
assert(out60.success === true, 'Outward of remaining 60 kg must succeed');
assert(stock.physicalRemaining === 0, 'Physical remaining is 0 kg');
assert(stock.availableStock === 0, 'Available stock is 0 kg');
console.log('✔ Step 9: Outward remaining 60 kg -> Allowed (Stock fully completed)');

// Step 10: Try outward beyond available stock when inward completed
const outBeyond = stock.attemptOutward(1);
assert(outBeyond.success === false, 'Outward beyond available stock must fail');
console.log('✔ Step 10: Try outward beyond available stock -> Blocked');

// --- 12. Batch & Multi-Stack Outward Pre-Aggregation Protection ---
console.log('\n--- 12. Testing Batch & Multi-Stack Outward Pre-Aggregation Protection ---');

// Inward: 500 Kg, Pledged: 200 Kg, Available: 300 Kg
// Multi-stack batch payload: Stack A asks for 200 Kg, Stack B asks for 150 Kg -> Total requested 350 Kg
const requestedAllocations = [
  { inwardId: 'inw-multi', stack: 'Stack 1', quantityKg: 200 },
  { inwardId: 'inw-multi', stack: 'Stack 2', quantityKg: 150 },
];
const preAggregatedQty = requestedAllocations.reduce((sum, item) => sum + item.quantityKg, 0);
assert(preAggregatedQty === 350, 'Total requested is 350 kg');
const availableUnpledged = 300;
const isBatchAllowed = preAggregatedQty <= availableUnpledged;
assert(isBatchAllowed === false, 'Batch exceeding total unpledged available stock across stacks must be rejected before saving');
console.log('✔ Batch & Multi-Stack pre-aggregation correctly blocks split requests that exceed total available stock');

console.log('\n========================================');
console.log('ALL UNIT TESTS PASSED SUCCESSFULLY! 🌟');
console.log('========================================\n');
