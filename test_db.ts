import mongoose from 'mongoose';
import connectToDatabase from './lib/mongoose';
import ColdInward from './lib/models/ColdInward';

async function run() {
  await connectToDatabase();
  const inward = await ColdInward.findOne().sort({ createdAt: -1 }).lean();
  console.log(JSON.stringify(inward, null, 2));
  process.exit(0);
}

run();
