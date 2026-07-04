/*
  Run this script from the repo root to reset client user passwords to '123456'.
  Usage:
    MONGODB_URI="your-uri" node scripts/reset-client-passwords.js

  It will update users linked from `clients.userId` and users with role FARMER|FPO|COMPANY.
*/

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!uri) {
    console.error('MONGODB_URI not set. Run with: MONGODB_URI="<uri>" node scripts/reset-client-passwords.js');
    process.exit(1);
  }

  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    await client.connect();
    const db = client.db();
    console.log('Connected to', uri.replace(/:\/\/.*@|:\d+\//, '://***@'));

    // Collect userIds from clients
    const clientDocs = await db.collection('clients').find({}).project({ userId: 1 }).toArray();
    const userIdsFromClients = clientDocs.map(c => c.userId).filter(Boolean).map(id => id.toString());

    // Collect users by role
    const roles = ['FARMER', 'FPO', 'COMPANY'];
    const usersByRole = await db.collection('users').find({ role: { $in: roles } }).project({ _id: 1 }).toArray();
    const userIdsByRole = usersByRole.map(u => u._id.toString());

    const allUserIdSet = new Set([...userIdsFromClients, ...userIdsByRole]);
    const allUserIds = Array.from(allUserIdSet);

    if (allUserIds.length === 0) {
      console.log('No client-linked users found. Nothing to do.');
      return;
    }

    console.log(`Found ${allUserIds.length} users to update.`);

    const hashed = await bcrypt.hash('123456', 12);

    // Update in batches
    const objectIds = allUserIds.map(id => {
      try { return new ObjectId(id); } catch { return id; }
    });

    const res = await db.collection('users').updateMany({ _id: { $in: objectIds } }, { $set: { password: hashed, updatedAt: new Date() } });

    console.log('Modified count:', res.modifiedCount);

    // Show sample of affected users
    const sample = await db.collection('users').find({ _id: { $in: objectIds } }).project({ email: 1 }).limit(10).toArray();
    console.log('Sample updated emails:', sample.map(s => s.email));

    console.log('Done. Users now have password 123456. Recommend notifying users and forcing change where appropriate.');
  } catch (err) {
    console.error('Script error:', err);
    process.exit(2);
  } finally {
    await client.close();
  }
}

main();
