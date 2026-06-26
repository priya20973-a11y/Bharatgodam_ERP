const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Dynamically read environment variables
let mongoUri = 'mongodb://localhost:27017';
let dbName = 'wms_production';

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    envLines.forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        if (key === 'MONGODB_URI') mongoUri = val;
        if (key === 'MONGODB_DB') dbName = val;
      }
    });
  }
} catch (err) {}

// Import functions from the built/compiled workspace
// Since we are running in Next.js/Typescript environment, we can use ts-node or run via the compiled files if they exist.
// Or we can import them directly if we require them.
// Let's write a simple script that directly uses the parsed modules using dynamic require.
// Wait, we can test the date parsing functions in lib/ledger-engine.ts, lib/ledger-time-state-engine.ts, and lib/storage-engine.ts.
// Let's copy/test the updated helpers or compile and run them.

const { calculateLedger } = require('../lib/ledger-engine');
const { generateTimeStateLedger } = require('../lib/ledger-time-state-engine');
const { generateStoragePeriods } = require('../lib/storage-engine');

async function verify() {
  console.log('=== VERIFYING ROBUST DATE PARSING ===');
  
  // Test case 1: Verbose JavaScript string
  const verboseDate = "Mon Jun 17 2026 05:30:00 GMT+0530 (India Standard Time)";
  
  console.log('\n--- Testing ledger-engine.ts parseDate with verbose date ---');
  // Let's extract the parseDate function dynamically or simulate it
  const transactions = [
    {
      _id: "tx1",
      date: verboseDate,
      direction: "INWARD",
      mt: 100,
      clientName: "XYZ1",
      commodityName: "COTTON",
      gatePass: "GP-123"
    }
  ];
  
  const commodityRates = new Map([["COTTON", 10]]);
  
  try {
    const ledger = calculateLedger(transactions, [], "XYZ1", 0, commodityRates);
    console.log("✓ calculateLedger succeeded!");
    console.log("  Steps count:", ledger.ledgerSteps.length);
    if (ledger.ledgerSteps.length > 0) {
      console.log("  Step 1 Start Date:", ledger.ledgerSteps[0].startDate);
      console.log("  Step 1 End Date:", ledger.ledgerSteps[0].endDate);
      console.log("  Step 1 Rent Amount:", ledger.ledgerSteps[0].rentAmount);
    }
  } catch (err) {
    console.error("✗ calculateLedger failed:", err);
  }

  console.log('\n--- Testing ledger-time-state-engine.ts with verbose date ---');
  try {
    const timeStateLedger = generateTimeStateLedger(transactions, "XYZ1");
    console.log("✓ generateTimeStateLedger succeeded!");
    console.log("  Periods count:", timeStateLedger.timeStatePeriods.length);
    if (timeStateLedger.timeStatePeriods.length > 0) {
      console.log("  Period 1 Start Date:", timeStateLedger.timeStatePeriods[0].periodStartDate);
      console.log("  Period 1 End Date:", timeStateLedger.timeStatePeriods[0].periodEndDate);
    }
  } catch (err) {
    console.error("✗ generateTimeStateLedger failed:", err);
  }

  console.log('\n--- Testing storage-engine.ts generateStoragePeriods with verbose date ---');
  try {
    const storageTxns = [
      {
        date: verboseDate,
        type: "INWARD",
        qty: 100,
        clientId: "client1",
        commodityId: "comm1",
        warehouseId: "wh1"
      }
    ];
    const periods = generateStoragePeriods(storageTxns, undefined, 10);
    console.log("✓ generateStoragePeriods succeeded!");
    console.log("  Periods count:", periods.length);
    if (periods.length > 0) {
      console.log("  Period 1 Start Date:", periods[0].fromDate);
      console.log("  Period 1 End Date:", periods[0].toDate);
    }
  } catch (err) {
    console.error("✗ generateStoragePeriods failed:", err);
  }
}

verify().catch(console.error);
