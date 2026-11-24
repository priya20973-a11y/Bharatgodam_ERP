import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import ColdPledgee from '../lib/models/ColdPledgee';
import ColdAssayer from '../lib/models/ColdAssayer';
import ColdPledge from '../lib/models/ColdPledge';
import ColdInward from '../lib/models/ColdInward';
import ColdCommodity from '../lib/models/ColdCommodity';
import ColdWarehouse from '../lib/models/ColdWarehouse';
import Client from '../lib/models/Client';
import Assayer from '../lib/models/Assayer';
import Pledgee from '../lib/models/Pledgee';
import Pledge from '../lib/models/Pledge';
import Inward from '../lib/models/Inward';
import { getApprovalWindowDetails } from '../lib/assaying-utils';

async function runTests() {
  const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error('MONGODB_URL is not defined in environment variables');
  }

  console.log('Connecting to database...');
  await mongoose.connect(uri, { dbName: dbName || undefined });
  console.log('Connected to MongoDB successfully.');

  const testUserEmail = 'test_runner_cold@bharatgodam.test';
  const testUserId = new mongoose.Types.ObjectId();

  try {
    console.log('\n========================================');
    console.log('TEST 1: Cold Storage Pledge Master (ColdPledgee)');
    console.log('========================================');

    // Clean up any previous test records
    await ColdPledgee.deleteMany({ userEmail: testUserEmail });

    // 1.1 Create Bank Pledgee (with IIFC)
    const bankPledgee = await ColdPledgee.create({
      name: 'Test Cold Storage Bank Ltd',
      type: 'Bank',
      iifcCode: 'CSBL0009999',
      personName: 'Ramesh Patel',
      mobile: '9898001122',
      address: 'Cold Storage Finance Branch, Ahmedabad',
      userId: testUserId,
      userEmail: testUserEmail,
    });
    console.log('✔ Created Bank ColdPledgee:', bankPledgee.name, '(ID:', bankPledgee._id.toString(), ')');

    // 1.2 Create NBFC Pledgee (without IIFC)
    const nbfcPledgee = await ColdPledgee.create({
      name: 'Agri Cold Capital NBFC',
      type: 'NBFC',
      personName: 'Suresh Shah',
      mobile: '9898003344',
      userId: testUserId,
      userEmail: testUserEmail,
    });
    console.log('✔ Created NBFC ColdPledgee:', nbfcPledgee.name);

    // 1.3 Read Pledgees
    const readPledgees = await ColdPledgee.find({ userEmail: testUserEmail }).lean();
    if (readPledgees.length !== 2) throw new Error(`Expected 2 pledgees, got ${readPledgees.length}`);
    console.log('✔ Successfully queried ColdPledgees. Count:', readPledgees.length);

    // 1.4 Update Pledgee
    const updatedPledgee = await ColdPledgee.findByIdAndUpdate(
      bankPledgee._id,
      { $set: { personName: 'Ramesh K. Patel' } },
      { new: true }
    );
    if (updatedPledgee?.personName !== 'Ramesh K. Patel') throw new Error('Update failed');
    console.log('✔ Successfully updated ColdPledgee personName to:', updatedPledgee.personName);

    // 1.5 Verify Dry Storage Pledgees untouched
    const dryPledgees = await Pledgee.find({ userEmail: testUserEmail });
    if (dryPledgees.length !== 0) throw new Error('Dry Storage Pledgee collection was contaminated!');
    console.log('✔ Verified Dry Storage Pledgee collection is completely separate and untouched.');

    console.log('\n========================================');
    console.log('TEST 2: Cold Storage Assayer Master (ColdAssayer)');
    console.log('========================================');

    // Clean up
    await ColdAssayer.deleteMany({ userEmail: testUserEmail });

    // 2.1 Create Assayer
    const assayer = await ColdAssayer.create({
      name: 'Apex Cold Quality Labs',
      licenceNumber: 'LIC-COLD-9988',
      status: 'Active',
      userId: testUserId,
      userEmail: testUserEmail,
    });
    console.log('✔ Created ColdAssayer:', assayer.name, 'Licence:', assayer.licenceNumber);

    // 2.2 Duplicate licence check
    try {
      await ColdAssayer.create({
        name: 'Duplicate Lab',
        licenceNumber: 'LIC-COLD-9988',
        status: 'Active',
        userId: testUserId,
        userEmail: testUserEmail,
      });
      throw new Error('Duplicate licence should have failed!');
    } catch (err: any) {
      if (err.code === 11000) {
        console.log('✔ Duplicate licence properly rejected by unique index (code 11000).');
      } else {
        throw err;
      }
    }

    // 2.3 Read & Update Assayer
    const updatedAssayer = await ColdAssayer.findByIdAndUpdate(
      assayer._id,
      { $set: { status: 'Active' } },
      { new: true }
    );
    if (!updatedAssayer) throw new Error('Failed to find and update assayer');
    console.log('✔ ColdAssayer verified and updated.');

    // 2.4 Verify Dry Storage Assayers untouched
    const dryAssayers = await Assayer.find({ userEmail: testUserEmail });
    if (dryAssayers.length !== 0) throw new Error('Dry Storage Assayer collection was contaminated!');
    console.log('✔ Verified Dry Storage Assayer collection is completely separate and untouched.');

    console.log('\n========================================');
    console.log('TEST 3: Assaying & Grading Module in Cold Storage');
    console.log('========================================');

    // Create prerequisite test Client, ColdWarehouse, and ColdCommodity
    let testClient = await Client.findOne({ userEmail: testUserEmail });
    if (!testClient) {
      testClient = await Client.create({
        name: 'Cold Test Farmer',
        mobile: '9123456780',
        userEmail: testUserEmail,
        userId: testUserId,
      });
    }

    let testWarehouse = await ColdWarehouse.findOne({ userEmail: testUserEmail });
    if (!testWarehouse) {
      testWarehouse = await ColdWarehouse.create({
        name: 'Test Central Cold Hub',
        warehouseId: 'WH-COLD-99',
        address: 'Mehsana',
        userEmail: testUserEmail,
        userId: testUserId,
        chambers: [{
          name: 'Chamber 1',
          chamberNo: 1,
          floors: [{
            floorNo: 1,
            stacks: [{ stackNo: 1, capacity: 50000 }]
          }]
        }]
      });
    }

    let testCommodity = await ColdCommodity.findOne({ name: 'TEST COLD POTATO', userEmail: testUserEmail });
    if (!testCommodity) {
      testCommodity = await ColdCommodity.create({
        name: 'TEST COLD POTATO',
        type: 'Kufri Jyoti',
        unit: 'Bag',
        siUnit: 'kg',
        rentCalculationOn: 'Kg',
        qualityParameters: [
          { name: 'Moisture', lowerLimit: 65, upperLimit: 85 },
          { name: 'Foreign Matter', lowerLimit: 0, upperLimit: 2 }
        ],
        gradingParameters: [
          { name: 'Moisture', lowRange: 65, highRange: 85 },
          { name: 'Sugar Content', lowRange: 0.1, highRange: 0.5 }
        ],
        seasonalPrices: [{
          fromDate: new Date('2026-01-01'),
          toDate: new Date('2026-12-31'),
          pricePerKg: 2.5
        }],
        userEmail: testUserEmail,
        userId: testUserId,
      });
    }

    // Clean up test inwards
    await ColdInward.deleteMany({ userEmail: testUserEmail });

    // 3.1 Create ColdInward with Assaying Required = Yes
    const today = new Date();
    const expiryDate = new Date(today);
    expiryDate.setDate(today.getDate() + 90); // 90 days shelf-life

    const coldInward = await ColdInward.create({
      clientId: testClient._id,
      commodityId: testCommodity._id,
      warehouseId: testWarehouse._id,
      receiptNumber: 'INW-COLD-TEST-001',
      lotNo: 'LOT-COLD-2026-001',
      date: today,
      quantityKg: 20000,
      bagsCount: 400,
      remainingQuantityKg: 20000,
      remainingBagsCount: 400,
      unit: 'KG',
      status: 'Active',
      stackAllocations: [{
        chamberName: 'Chamber 1',
        chamberNo: 1,
        floorNo: 1,
        stackNo: 1,
        allocatedWeight: 20000,
        bagsCount: 400,
      }],
      isAssayingRequired: true,
      assayerId: assayer._id,
      assayingDate: today,
      assayingExpiryDate: expiryDate,
      gradingStatus: 'PENDING',
      gradingResults: [
        { parameterName: 'Moisture', observedValue: '75', status: 'OK' },
        { parameterName: 'Sugar Content', observedValue: '0.2', status: 'OK' },
      ],
      userEmail: testUserEmail,
      userId: testUserId,
    });
    console.log('✔ Created ColdInward with Assaying Required = Yes. Lot:', coldInward.lotNo, 'Qty:', coldInward.quantityKg, 'Kg');

    // 3.2 Verify 7-day decision window logic
    const windowInfo = getApprovalWindowDetails(coldInward.assayingDate);
    if (!windowInfo.isOpen) throw new Error('7-day approval window should be OPEN for today!');
    console.log('✔ 7-Day Decision Window verified: Status:', windowInfo.status, 'Days Left:', windowInfo.daysLeft);

    // 3.3 Test Approval workflow
    coldInward.gradingStatus = 'APPROVED';
    coldInward.gradingDecisionDate = new Date();
    coldInward.gradingDecisionByName = 'Authorized Quality Officer';
    coldInward.gradingDecisionRemarks = 'Verified moisture and sugar parameters within standard specs.';
    coldInward.approvedGradingResults = [
      { parameterName: 'Moisture', observedValue: '75', status: 'OK' },
      { parameterName: 'Sugar Content', observedValue: '0.2', status: 'OK' },
    ];
    await coldInward.save();

    const savedInward = await ColdInward.findById(coldInward._id).lean();
    if (savedInward?.gradingStatus !== 'APPROVED') throw new Error('Grading approval status did not persist');
    if (!savedInward?.gradingDecisionDate) throw new Error('Grading decision date was not saved');
    console.log('✔ Assaying Decision successfully approved and recorded with audit metadata.');

    // 3.4 Verify Dry Storage Inward collection untouched
    const dryInwards = await Inward.find({ userEmail: testUserEmail });
    if (dryInwards.length !== 0) throw new Error('Dry Storage Inward collection was contaminated!');
    console.log('✔ Verified Dry Storage Inward collection is completely separate and untouched.');

    console.log('\n========================================');
    console.log('TEST 4: Cold Storage Pledge Module');
    console.log('========================================');

    // Clean up pledges
    await ColdPledge.deleteMany({ userEmail: testUserEmail });

    // 4.1 Create Cold Storage Pledge
    const loanDate = new Date();
    const repaymentDate = new Date(loanDate);
    repaymentDate.setDate(loanDate.getDate() + 60); // 60 days (before 90-day expiry)

    const coldPledge = await ColdPledge.create({
      pledgeNo: 'PLG-COLD-2026-001',
      loanDate,
      repaymentDate,
      clientId: testClient._id,
      lenderId: bankPledgee._id,
      lenderName: bankPledgee.name,
      loanAmount: 400000,
      remarks: 'Crop loan against 15,000 Kg cold stored potatoes',
      status: 'ACTIVE',
      items: [{
        inwardId: coldInward._id,
        storageType: 'COLD',
        commodityId: testCommodity._id,
        warehouseId: testWarehouse._id,
        chamberName: 'Chamber 1',
        floorNo: 1,
        stackNo: 1,
        pledgedQuantity: 15000, // 15,000 Kg pledged
        pledgedBags: 300,
        releasedQuantity: 0,
        releasedBags: 0,
      }],
      userEmail: testUserEmail,
      userId: testUserId,
    });
    console.log('✔ Created ColdPledge:', coldPledge.pledgeNo, 'Pledged Qty: 15,000 Kg, Status:', coldPledge.status);

    // 4.2 Verify Stock Locking Calculation
    // Total physical remaining: 20,000 Kg. Pledged: 15,000 Kg. Unpledged available: 5,000 Kg.
    const activePledgeAgg = await ColdPledge.aggregate([
      { $match: { _id: coldPledge._id, status: { $in: ['ACTIVE', 'PARTIAL'] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.inwardId',
          netPledged: {
            $sum: { $subtract: ['$items.pledgedQuantity', { $ifNull: ['$items.releasedQuantity', 0] }] }
          }
        }
      }
    ]);
    const netPledged = activePledgeAgg[0]?.netPledged || 0;
    const availableUnpledged = coldInward.quantityKg - netPledged;
    if (netPledged !== 15000 || availableUnpledged !== 5000) {
      throw new Error(`Stock locking failed: Expected netPledged=15000, avail=5000; Got netPledged=${netPledged}, avail=${availableUnpledged}`);
    }
    console.log('✔ Stock locking verified: Physical Stock = 20,000 Kg, Pledged = 15,000 Kg, Available for Outward = 5,000 Kg.');

    // 4.3 Test Partial Release (Release 5,000 Kg out of 15,000 Kg)
    const receiptNo = `${coldPledge.pledgeNo}-R1`;
    coldPledge.items[0].releasedQuantity = 5000;
    coldPledge.items[0].releasedBags = 100;
    coldPledge.status = 'PARTIAL';
    coldPledge.releaseHistory.push({
      receiptNo,
      releaseDate: new Date(),
      clientName: testClient.name,
      clientLocation: 'Mehsana',
      clientIdString: testClient._id.toString(),
      items: [{
        inwardId: coldInward._id,
        warehouseName: testWarehouse.name,
        warehouseAddress: testWarehouse.address || 'Mehsana',
        warehouseIdentifier: testWarehouse.warehouseId || 'WH-COLD-99',
        commodityName: testCommodity.name,
        totalNetWtKg: 15000,
        previousReleasedKg: 0,
        currentReleasedKg: 5000,
        balanceNetWtKg: 10000,
        releasedQuantity: 5000,
        releasedBags: 100,
      }],
      releasedBy: 'Authorized Cold Manager',
      remarks: 'Partial repayment received from farmer',
    });
    await coldPledge.save();

    console.log('✔ Partial release executed successfully: Receipt No:', receiptNo, 'Status:', coldPledge.status);

    // Verify stock unlocked after partial release
    // Net pledged is now 10,000 Kg. Available for outward = 10,000 Kg.
    const remainingPledged = coldPledge.items[0].pledgedQuantity - coldPledge.items[0].releasedQuantity;
    if (remainingPledged !== 10000) throw new Error('Partial release math error');
    console.log('✔ After partial release: Remaining Pledged = 10,000 Kg, Available for Outward = 10,000 Kg.');

    // 4.4 Test Full Release (Release remaining 10,000 Kg)
    const receiptNo2 = `${coldPledge.pledgeNo}-R2`;
    coldPledge.items[0].releasedQuantity = 15000;
    coldPledge.items[0].releasedBags = 300;
    coldPledge.status = 'RELEASED';
    coldPledge.releaseDate = new Date();
    coldPledge.releaseHistory.push({
      receiptNo: receiptNo2,
      releaseDate: new Date(),
      clientName: testClient.name,
      clientLocation: 'Mehsana',
      clientIdString: testClient._id.toString(),
      items: [{
        inwardId: coldInward._id,
        warehouseName: testWarehouse.name,
        warehouseAddress: testWarehouse.address || 'Mehsana',
        warehouseIdentifier: testWarehouse.warehouseId || 'WH-COLD-99',
        commodityName: testCommodity.name,
        totalNetWtKg: 15000,
        previousReleasedKg: 5000,
        currentReleasedKg: 10000,
        balanceNetWtKg: 0,
        releasedQuantity: 10000,
        releasedBags: 200,
      }],
      releasedBy: 'Authorized Cold Manager',
      remarks: 'Full loan closed. Stock lien released completely.',
    });
    await coldPledge.save();

    console.log('✔ Full release executed successfully: Receipt No:', receiptNo2, 'Status:', coldPledge.status);

    // Verify stock unlocked after full release
    const fullyReleasedPledge = await ColdPledge.findById(coldPledge._id).lean();
    if (fullyReleasedPledge?.status !== 'RELEASED') throw new Error('Status should be RELEASED');
    if (fullyReleasedPledge?.releaseHistory?.length !== 2) throw new Error('Expected 2 release receipts in history');
    console.log('✔ Full release verified: All 15,000 Kg released, Status is RELEASED, 2 receipts generated.');

    // 4.5 Verify Dry Storage Pledge collection untouched
    const dryPledges = await Pledge.find({ userEmail: testUserEmail });
    if (dryPledges.length !== 0) throw new Error('Dry Storage Pledge collection was contaminated!');
    console.log('✔ Verified Dry Storage Pledge collection is completely separate and untouched.');

    console.log('\n========================================');
    console.log('ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('========================================\n');

  } finally {
    // Cleanup test data
    console.log('Cleaning up test data...');
    await ColdPledge.deleteMany({ userEmail: testUserEmail });
    await ColdInward.deleteMany({ userEmail: testUserEmail });
    await ColdAssayer.deleteMany({ userEmail: testUserEmail });
    await ColdPledgee.deleteMany({ userEmail: testUserEmail });
    await ColdCommodity.deleteMany({ userEmail: testUserEmail });
    await ColdWarehouse.deleteMany({ userEmail: testUserEmail });
    await Client.deleteMany({ userEmail: testUserEmail });
    await mongoose.disconnect();
    console.log('Disconnected from database.');
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
