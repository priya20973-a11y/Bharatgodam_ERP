/**
 * Test Signup Approval Flow
 * Tests the new signup process with admin approval
 */

const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const http = require('http');

const MONGODB_URL = 'mongodb://localhost:27017';
const MONGODB_DB = 'wms_production';
const BASE_URL = 'http://localhost:3000';

function makeRequest(path, method = 'GET', body = null, includeAuth = false, authToken = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (includeAuth && authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
            headers: res.headers
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testSignupApprovalFlow() {
  console.log('=== Testing Signup Approval Flow ===\n');

  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db(MONGODB_DB);

  try {
    // Step 1: Submit signup request
    console.log('Step 1: Submitting signup request...');
    const signupData = {
      fullName: 'Test User',
      email: `test-signup-${Date.now()}@example.com`,
      password: 'testpass123',
      confirmPassword: 'testpass123',
      companyName: 'Test Company',
      phoneNumber: '+1234567890',
      warehouseLocation: 'Test Location',
      gstNumber: 'TEST123456789'
    };

    const signupRes = await makeRequest('/api/auth/signup', 'POST', signupData);
    console.log('Signup response:', signupRes.status, signupRes.data);

    if (signupRes.status !== 201) {
      console.log('❌ Signup failed');
      return;
    }

    // Step 2: Check signup request was created
    console.log('\nStep 2: Checking signup request in database...');
    const request = await db.collection('signup_requests').findOne({ email: signupData.email });
    if (request) {
      console.log('✅ Signup request created:', request._id);
    } else {
      console.log('❌ Signup request not found');
      return;
    }

    // Step 3: Admin login (simulate)
    console.log('\nStep 3: Simulating admin login...');
    // In a real test, we'd use NextAuth login, but for now let's directly approve

    // Step 4: Admin approves the request
    console.log('\nStep 4: Admin approving signup request...');
    const approveRes = await makeRequest('/api/admin/signup-requests', 'POST', {
      action: 'approve',
      requestId: request._id.toString()
    });
    console.log('Approve response:', approveRes.status, approveRes.data);

    if (approveRes.status !== 200) {
      console.log('❌ Approval failed');
      return;
    }

    // Step 5: Check user was created
    console.log('\nStep 5: Checking user was created...');
    const user = await db.collection('users').findOne({ email: signupData.email });
    if (user) {
      console.log('✅ User created:', user._id);
      console.log('   Role:', user.role);
      console.log('   Full Name:', user.fullName);
    } else {
      console.log('❌ User not created');
    }

    // Step 6: Check signup request was updated
    console.log('\nStep 6: Checking signup request status...');
    const updatedRequest = await db.collection('signup_requests').findOne({ _id: request._id });
    console.log('Request status:', updatedRequest.status);

    console.log('\n🎉 Signup approval flow test completed!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.close();
  }
}

testSignupApprovalFlow().catch(console.error);