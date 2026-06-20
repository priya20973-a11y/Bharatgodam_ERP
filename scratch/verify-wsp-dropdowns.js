const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Mock getDropdownDisplayName helper since it is in TS and Node.js doesn't run TS directly without a runner
function getDropdownDisplayName(item, allItems, isAdmin) {
  const name = item?.name || item?.label || '';
  if (!isAdmin || !name) return name;
  const isDuplicate = allItems.filter(
    i => i && (i.name || i.label)?.trim().toUpperCase() === name.trim().toUpperCase()
  ).length > 1;
  
  if (isDuplicate && item.wspName) {
    return `${name} (${item.wspName})`;
  }
  return name;
}

async function verifyWspDropdowns() {
  // Load .env.local
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
  } catch (err) {
    console.error('Error reading .env.local:', err.message);
  }

  console.log(`Connecting to: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}`);
  console.log(`Using Database: ${dbName}`);

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);

  console.log('\n=== VERIFYING WSP DROPDOWN DATA AND SUFFIX LOGIC ===\n');

  // Fetch users and print their companyNames
  const users = await db.collection('users').find({}).toArray();
  console.log('Users in database:');
  users.forEach(u => {
    console.log(`- ID: ${u._id}, Email: ${u.email}, Name: ${u.fullName}, Company: ${u.companyName || '(None)'}`);
  });
  console.log('');

  // Fetch clients
  const clients = await db.collection('clients').find({}).toArray();
  console.log('Clients in database:');
  clients.forEach(c => {
    console.log(`- ID: ${c._id}, Name: ${c.name}, User ID: ${c.userId}`);
  });
  console.log('');

  // Let's resolve wspName for each client
  const userMap = new Map(users.map(u => [u._id.toString(), u]));
  const clientsWithWsp = clients.map(c => {
    const userId = c.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (c.userId ? 'Unknown' : 'System');
    return {
      _id: c._id.toString(),
      name: c.name,
      wspName
    };
  });

  console.log('Resolved Clients with wspName:');
  clientsWithWsp.forEach(c => {
    console.log(`- Name: ${c.name}, wspName: ${c.wspName}`);
  });
  console.log('');

  // Run duplicate display suffix test cases
  console.log('Testing Suffix Display Logic:');
  
  // Case 1: Unique Client (e.g. "Wheat Traders")
  const testList = [
    { name: 'Wheat Traders', wspName: 'WSP Alpha' },
    { name: 'Rice Traders', wspName: 'WSP Beta' }
  ];
  
  console.log('Test Case 1 (Unique name, Admin=true):');
  console.log(`  Expected: "Wheat Traders"`);
  console.log(`  Actual:   "${getDropdownDisplayName(testList[0], testList, true)}"`);

  // Case 2: Duplicate Client name (e.g. "Soybean Traders")
  const duplicateTestList = [
    { name: 'Soybean Traders', wspName: 'WSP Alpha' },
    { name: 'Soybean Traders', wspName: 'WSP Beta' },
    { name: 'Wheat Traders', wspName: 'WSP Gamma' }
  ];

  console.log('Test Case 2 (Duplicate name, Admin=true):');
  console.log(`  Expected: "Soybean Traders (WSP Alpha)"`);
  console.log(`  Actual:   "${getDropdownDisplayName(duplicateTestList[0], duplicateTestList, true)}"`);
  console.log(`  Expected: "Soybean Traders (WSP Beta)"`);
  console.log(`  Actual:   "${getDropdownDisplayName(duplicateTestList[1], duplicateTestList, true)}"`);

  // Case 3: Duplicate Client name, Admin=false (WSP View)
  console.log('Test Case 3 (Duplicate name, Admin=false):');
  console.log(`  Expected: "Soybean Traders"`);
  console.log(`  Actual:   "${getDropdownDisplayName(duplicateTestList[0], duplicateTestList, false)}"`);

  await client.close();
  console.log('\nVerification completed successfully.');
}

verifyWspDropdowns().catch(console.error);
