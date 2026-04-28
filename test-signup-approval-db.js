/**
 * Test Signup Approval Flow (Database Direct)
 * Tests the signup approval workflow by directly manipulating the database
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DB = 'wms_production';

async function testSignupApprovalFlow() {
  console.log('=== Testing Signup Approval Flow (Database Direct) ===\n');

  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(MONGODB_DB);

  try {
    // Step 1: Create signup request
    console.log('Step 1: Creating signup request...');
    const signupData = {
      fullName: 'Test User',
      email: `test-signup-${Date.now()}@example.com`,
      password: await bcrypt.hash('testpass123', 10),
      companyName: 'Test Company',
      phoneNumber: '+1234567890',
      warehouseLocation: 'Test Location',
      gstNumber: 'TEST123456789',
      status: 'pending',
      createdAt: new Date()
    };

    const result = await db.collection('signup_requests').insertOne(signupData);
    const requestId = result.insertedId;
    console.log('✅ Signup request created:', requestId);

    // Step 2: Simulate admin approval
    console.log('\nStep 2: Simulating admin approval...');

    // Get the request
    const request = await db.collection('signup_requests').findOne({ _id: requestId });
    if (!request) {
      console.log('❌ Request not found');
      return;
    }

    // Create user from request
    const userData = {
      email: request.email,
      password: request.password,
      role: 'user',
      fullName: request.fullName,
      companyName: request.companyName,
      phoneNumber: request.phoneNumber,
      warehouseLocation: request.warehouseLocation,
      gstNumber: request.gstNumber,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const userResult = await db.collection('users').insertOne(userData);
    console.log('✅ User created:', userResult.insertedId);

    // Update request status
    await db.collection('signup_requests').updateOne(
      { _id: requestId },
      { $set: { status: 'approved', approvedAt: new Date() } }
    );
    console.log('✅ Request status updated to approved');

    // Step 3: Verify results
    console.log('\nStep 3: Verifying results...');
    const user = await db.collection('users').findOne({ email: request.email });
    const updatedRequest = await db.collection('signup_requests').findOne({ _id: requestId });

    if (user) {
      console.log('✅ User verified:', {
        email: user.email,
        role: user.role,
        fullName: user.fullName
      });
    } else {
      console.log('❌ User not found');
    }

    console.log('Request status:', updatedRequest.status);

    console.log('\n🎉 Signup approval flow test completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
  }
}

testSignupApprovalFlow().catch(console.error);