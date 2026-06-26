/**
 * Migration script to populate the dedicated state field for all warehouses in the database.
 * Matches warehouse addresses and locations against the list of Indian states.
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

let MONGODB_URL = 'mongodb://localhost:27017';
let MONGODB_DB = 'wms_production';

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key === 'MONGODB_URL' || key === 'MONGODB_URI') {
          MONGODB_URL = value;
        }
        if (key === 'MONGODB_DB') {
          MONGODB_DB = value;
        }
      }
    }
  }
} catch (e) {
  console.error('Failed to parse .env.local:', e);
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands",
  "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Lakshadweep", "Puducherry"
];

async function migrate() {
  console.log(`Connecting to URL: ${MONGODB_URL.replace(/:[^@]+@/, ':***@')}`);
  const client = new MongoClient(MONGODB_URL);
  try {
    await client.connect();
    const db = client.db(MONGODB_DB);

    console.log('Connected to database:', MONGODB_DB);
    const warehouses = await db.collection('warehouses').find({}).toArray();

    console.log(`Found ${warehouses.length} warehouses to migrate.`);

    for (const wh of warehouses) {
      let whState = '';
      const searchStr = `${wh.address || ''} ${wh.location || ''} ${wh.name || ''}`.toLowerCase();

      for (const state of INDIAN_STATES) {
        if (searchStr.includes(state.toLowerCase())) {
          whState = state;
          break;
        }
      }

      if (!whState) {
        console.warn(`Warning: Could not automatically detect state for warehouse "${wh.name}" (Address: "${wh.address}", Location: "${wh.location}"). Skipping state update.`);
        continue;
      }

      console.log(`Updating warehouse "${wh.name}" (${wh._id}): state = "${whState}"`);
      await db.collection('warehouses').updateOne(
        { _id: wh._id },
        { $set: { state: whState } }
      );
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.close();
  }
}

migrate();
