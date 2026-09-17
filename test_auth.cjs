const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('wms_production');

  const user = await db.collection('users').findOne({});
  if (!user) return console.log('No users found');

  console.time('Total Simulate');
  
  console.time('DB Lookup');
  await db.collection('users').findOne({ email: user.email });
  console.timeEnd('DB Lookup');

  console.time('Bcrypt Compare');
  await bcrypt.compare('dummyPassword', user.password);
  console.timeEnd('Bcrypt Compare');

  console.timeEnd('Total Simulate');
  
  await client.close();
}

run();
