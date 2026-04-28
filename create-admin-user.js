const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

async function createAdminUser() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('wms_production');

  const adminUser = {
    email: 'admin@wms.com',
    password: await bcrypt.hash('admin123', 10),
    role: 'admin',
    fullName: 'System Administrator',
    companyName: 'WMS Admin',
    phoneNumber: '+1234567890',
    warehouseLocation: 'Head Office',
    gstNumber: 'ADMIN123456789',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  try {
    await db.collection('users').insertOne(adminUser);
    console.log('Admin user created successfully');
    console.log('Email: admin@wms.com');
    console.log('Password: admin123');
  } catch (e) {
    if (e.code === 11000) {
      console.log('Admin user already exists');
    } else {
      console.error('Error creating admin user:', e);
    }
  }

  await client.close();
}

createAdminUser().catch(console.error);