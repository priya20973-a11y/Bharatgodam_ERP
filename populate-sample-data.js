/**
 * Sample Data Population Script
 * Adds basic sample data for testing the warehouse management system
 * Uses the same database connection as the application
 */

const { MongoClient } = require('mongodb');

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'wms_production';

async function populateSampleData() {
  const client = new MongoClient(MONGODB_URL, {
    serverApi: {
      version: '1',
      strict: true,
      deprecationErrors: true,
    },
  });

  try {
    console.log('🌱 Starting sample data population...');
    console.log(`📍 MongoDB URL: ${MONGODB_URL}`);
    console.log(`📊 Database: ${MONGODB_DB}`);

    await client.connect();
    const db = client.db(MONGODB_DB);

    // Sample warehouses
    const warehouses = [
      {
        _id: 'warehouse-001',
        name: 'Main Warehouse',
        location: 'Industrial Area',
        capacity: 10000,
        createdAt: new Date()
      },
      {
        _id: 'warehouse-002',
        name: 'Secondary Warehouse',
        location: 'Commercial Zone',
        capacity: 5000,
        createdAt: new Date()
      }
    ];

    // Sample commodities
    const commodities = [
      {
        _id: 'commodity-001',
        name: 'Rice',
        ratePerMtMonth: 150,
        createdAt: new Date()
      },
      {
        _id: 'commodity-002',
        name: 'Wheat',
        ratePerMtMonth: 120,
        createdAt: new Date()
      }
    ];

    // Sample clients
    const clients = [
      {
        _id: 'client-001',
        name: 'XYZ Enterprises',
        contact: '9876543211',
        createdAt: new Date()
      }
    ];

    // Insert sample data
    console.log('---');

    if (warehouses.length > 0) {
      await db.collection('warehouses').insertMany(warehouses);
      console.log(`✅ Added ${warehouses.length} warehouses`);
    }

    if (commodities.length > 0) {
      await db.collection('commodities').insertMany(commodities);
      console.log(`✅ Added ${commodities.length} commodities`);
    }

    if (clients.length > 0) {
      await db.collection('clients').insertMany(clients);
      console.log(`✅ Added ${clients.length} clients`);
    }

    console.log('---');
    console.log('🎉 Sample data population completed successfully!');
    console.log('💡 You can now test the application with sample data');

  } catch (error) {
    console.error('❌ Sample data population failed:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
}

// Run the population
populateSampleData();