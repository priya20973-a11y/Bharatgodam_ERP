import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env and .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const uri = process.env.MONGODB_URL;
const dbName = process.env.MONGODB_DB;

if (!uri) {
  console.error('Missing MONGODB_URL environment variable.');
  process.exit(1);
}
if (!dbName) {
  console.error('Missing MONGODB_DB environment variable.');
  process.exit(1);
}

const adminEmailValue = 'shrutimehata.01@gmail.com';
const adminPassword = '123456';

async function ensureAdminUser() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const users = db.collection('users');

    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    const now = new Date();

    const existingUser = await users.findOne({ email: adminEmailValue });

    if (existingUser) {
      const updateDoc = {
        $set: {
          password: hashedPassword,
          role: 'ADMIN',
          updatedAt: now,
        },
      };

      await users.updateOne({ _id: existingUser._id }, updateDoc);
      console.log(`✅ Updated existing admin user: ${adminEmailValue}`);
    } else {
      await users.insertOne({
        email: adminEmailValue,
        password: hashedPassword,
        role: 'ADMIN',
        createdAt: now,
        updatedAt: now,
      });
      console.log(`✅ Seeded admin user: ${adminEmailValue}`);
    }

    console.log('Admin credentials are set. You can now sign in with the configured admin account.');
  } catch (error) {
    console.error('Failed to seed admin user:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

ensureAdminUser();
