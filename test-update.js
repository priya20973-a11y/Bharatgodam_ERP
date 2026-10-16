const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const mongoose = require('mongoose');

async function test() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || 'wms_production' });
  console.log('Connected to Mongoose');

  // Let's check Warehouse model
  // If we require the model file
  const Warehouse = require('./lib/models/Warehouse.ts').default;
  console.log('Warehouse schema paths:', Object.keys(Warehouse.schema.paths));

  await mongoose.disconnect();
}
test().catch(console.error);
