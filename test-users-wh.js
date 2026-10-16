const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

async function test() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'wms_production');

  const warehouses = await db.collection('warehouses').find({}).toArray();
  console.log('Warehouses count:', warehouses.length);
  warehouses.forEach(w => {
    console.log(`- ${w.name} (_id: ${w._id}): userId=${w.userId}, userEmail=${w.userEmail}`);
  });

  const users = await db.collection('users').find({}).toArray();
  console.log('Users count:', users.length);
  users.forEach(u => {
    console.log(`- ${u.fullName || u.email} (_id: ${u._id}, role: ${u.role}, email: ${u.email})`);
  });

  await client.close();
}
test().catch(console.error);
