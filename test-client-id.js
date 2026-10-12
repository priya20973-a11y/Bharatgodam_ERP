import mongoose from 'mongoose';
import 'dotenv/config';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const clients = await mongoose.connection.db.collection('clients').find({}).toArray();
  for (const c of clients) {
    if (c.customClientId) {
       console.log(`Client ${c.name} has customClientId: ${c.customClientId}`);
    } else {
       console.log(`Client ${c.name} has NO customClientId`);
    }
  }
  process.exit(0);
}
test();
