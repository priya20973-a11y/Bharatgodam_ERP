'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import Pledge from '@/lib/models/Pledge';
import Inward from '@/lib/models/Inward';
import ColdInward from '@/lib/models/ColdInward';
import { requireSession, getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { logActivity } from '@/lib/cold-logger';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';

export async function getClientsForPledge() {
  await connectToDatabase();
  const session = await requireSession();
  
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const clientDocs = await db.collection('clients')
    .find({ ...getTenantFilterForMongo(session) })
    .sort({ name: 1 })
    .project({ _id: 1, name: 1, mobile: 1, clientName: 1 })
    .toArray();

  return clientDocs.map(c => ({
    _id: c._id.toString(),
    id: c._id.toString(),
    name: c.name || c.clientName || 'Unknown',
    mobile: c.mobile || ''
  }));
}

export async function getInwardsForPledge(clientId: string) {
  await connectToDatabase();
  const session = await requireSession();
  
  const filter = { 
    clientId: new mongoose.Types.ObjectId(clientId),
    ...getTenantFilterForMongo(session)
  };
  
  // Get all inwards for client from both Dry and Cold storage
  const dryInwardsRaw = await Inward.find(filter).populate('commodityId', 'name').populate('warehouseId', 'name').lean();
  const coldInwardsRaw = await ColdInward.find(filter).populate('commodityId', 'name').populate('warehouseId', 'name').lean();
  
  const dryInwards = dryInwardsRaw.map((i: any) => ({ ...i, storageType: 'DRY' }));
  const coldInwards = coldInwardsRaw.map((i: any) => ({ ...i, storageType: 'COLD' }));
  const inwards = [...dryInwards, ...coldInwards];

  // Get active pledges for these inwards
  const activePledges = await Pledge.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $in: ['ACTIVE', 'PARTIAL'] } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.inwardId',
        totalPledgedQuantity: { $sum: { $subtract: ['$items.pledgedQuantity', { $ifNull: ['$items.releasedQuantity', 0] }] } },
        totalPledgedBags: { $sum: { $subtract: ['$items.pledgedBags', { $ifNull: ['$items.releasedBags', 0] }] } }
      }
    }
  ]);

  const pledgeMap = new Map(activePledges.map(p => [p._id.toString(), p]));

  // Augment inwards with available unpledged quantity
  const result = inwards.map((inward: any) => {
    const pledgeData = pledgeMap.get(inward._id.toString()) || { totalPledgedQuantity: 0, totalPledgedBags: 0 };
    
    let baseQtyMT = 0;
    let baseBags = 0;
    
    if (inward.storageType === 'DRY') {
      baseQtyMT = inward.quantityMT || 0;
      baseBags = inward.bagsCount || 0;
    } else {
      const kg = inward.remainingQuantityKg ?? inward.quantityKg ?? 0;
      baseQtyMT = kg / 1000;
      baseBags = inward.remainingBagsCount ?? inward.bagsCount ?? 0;
    }

    const expiryDate = inward.assayingExpiryDate 
      ? new Date(inward.assayingExpiryDate).toISOString() 
      : (inward.expiryDate ? new Date(inward.expiryDate).toISOString() : null);

    return {
      ...inward,
      commodityName: inward.commodityId?.name,
      warehouseName: inward.warehouseId?.name,
      pledgedQuantity: pledgeData.totalPledgedQuantity,
      pledgedBags: pledgeData.totalPledgedBags,
      // For pledge creation, they can pledge up to base qty - pledgedQuantity.
      availableForPledgeMT: Math.max(0, baseQtyMT - pledgeData.totalPledgedQuantity),
      availableForPledgeBags: Math.max(0, baseBags - pledgeData.totalPledgedBags),
      assayingExpiryDate: expiryDate,
      expiryDate: expiryDate
    };
  }).filter((i: any) => i.availableForPledgeMT > 0);

  return JSON.parse(JSON.stringify(result));
}

export async function createPledge(data: {
  pledgeNo: string;
  loanDate: string;
  repaymentDate: string;
  clientId: string;
  lenderId: string;
  lenderName?: string;
  loanAmount: number;
  remarks?: string;
  items: {
    inwardId: string;
    storageType?: 'DRY' | 'COLD';
    commodityId: string;
    warehouseId: string;
    pledgedQuantity: number;
    pledgedBags: number;
  }[];
}) {
  await connectToDatabase();
  const session = await requireSession();

  try {
    if (!data.repaymentDate) {
      return { success: false, error: 'Repayment Date is mandatory.' };
    }

    const repaymentDateObj = new Date(data.repaymentDate);
    if (isNaN(repaymentDateObj.getTime())) {
      return { success: false, error: 'Invalid Repayment Date format.' };
    }
    const repaymentTime = new Date(
      repaymentDateObj.getFullYear(),
      repaymentDateObj.getMonth(),
      repaymentDateObj.getDate()
    ).getTime();

    if (data.loanDate) {
      const loanDateObj = new Date(data.loanDate);
      const loanTime = new Date(
        loanDateObj.getFullYear(),
        loanDateObj.getMonth(),
        loanDateObj.getDate()
      ).getTime();
      if (repaymentTime < loanTime) {
        return { success: false, error: 'Repayment Date cannot be earlier than Loan Date.' };
      }
    }

    // Backend validation: Ensure every selected stock lot has an expiry date and Repayment Date <= Expiry Date
    for (const item of data.items) {
      let inwardRecord: any = null;
      if (item.storageType === 'DRY') {
        inwardRecord = await Inward.findById(item.inwardId).lean();
      } else {
        inwardRecord = await ColdInward.findById(item.inwardId).lean();
      }

      if (!inwardRecord) {
        return { success: false, error: 'Selected inward stock record not found.' };
      }

      const inwardExpiry = inwardRecord.assayingExpiryDate || inwardRecord.expiryDate;
      if (!inwardExpiry) {
        const lotLabel = inwardRecord.lotNo ? `Lot: ${inwardRecord.lotNo}` : (inwardRecord.receiptNumber || 'Selected inward stock');
        return {
          success: false,
          error: `${lotLabel} does not have an Expiry Date from Assaying & Grading. Inward stock must have an Expiry Date to be pledged.`
        };
      }

      const expiryDateObj = new Date(inwardExpiry);
      const expiryTime = new Date(
        expiryDateObj.getFullYear(),
        expiryDateObj.getMonth(),
        expiryDateObj.getDate()
      ).getTime();

      if (repaymentTime > expiryTime) {
        const formattedExpiry = expiryDateObj.toLocaleDateString('en-IN');
        return {
          success: false,
          error: `Repayment Date cannot be later than Inward Stock Expiry Date (${formattedExpiry}).`
        };
      }
    }

    const pledgeData = appendOwnershipForMongo({
      pledgeNo: data.pledgeNo,
      loanDate: new Date(data.loanDate),
      repaymentDate: new Date(data.repaymentDate),
      clientId: new mongoose.Types.ObjectId(data.clientId),
      lenderId: new mongoose.Types.ObjectId(data.lenderId),
      lenderName: data.lenderName || 'Unknown Bank',
      loanAmount: data.loanAmount,
      remarks: data.remarks,
      status: 'ACTIVE',
      items: data.items.map(i => ({
        inwardId: new mongoose.Types.ObjectId(i.inwardId),
        storageType: i.storageType || 'DRY',
        commodityId: new mongoose.Types.ObjectId(i.commodityId),
        warehouseId: new mongoose.Types.ObjectId(i.warehouseId),
        pledgedQuantity: i.pledgedQuantity,
        pledgedBags: i.pledgedBags
      }))
    }, session);

    const pledge = await Pledge.create(pledgeData);

    await logActivity({
      actionType: 'CREATE',
      module: 'Pledge',
      recordId: pledge._id.toString(),
      description: `Created Pledge ${pledge.pledgeNo} for ${data.lenderName}`,
      newValue: JSON.parse(JSON.stringify(pledge)),
      storageType: data.items[0]?.storageType === 'COLD' ? 'Cold Storage' : 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/pledges');
    return { success: true, data: JSON.parse(JSON.stringify(pledge)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Pledge Number already exists.' };
    }
    return { success: false, error: error.message };
  }
}

export async function getPledges() {
  await connectToDatabase();
  const session = await requireSession();
  
  const pledges = await Pledge.find(getTenantFilterForMongo(session))
    .populate('clientId', 'name')
    .sort({ createdAt: -1 })
    .lean();
    
  // Fetch receipt/lot numbers for inwards
  const inwardIdsDry = [];
  const inwardIdsCold = [];
  for (const p of pledges) {
    for (const item of p.items) {
      if (item.storageType === 'DRY') inwardIdsDry.push(item.inwardId);
      if (item.storageType === 'COLD') inwardIdsCold.push(item.inwardId);
    }
  }

  const [dryInwards, coldInwards] = await Promise.all([
    mongoose.models.Inward ? mongoose.models.Inward.find({ _id: { $in: inwardIdsDry } }).select('receiptNumber lotNo').lean() : Promise.resolve([]),
    mongoose.models.ColdInward ? mongoose.models.ColdInward.find({ _id: { $in: inwardIdsCold } }).select('receiptNumber lotNo').lean() : Promise.resolve([])
  ]);

  const inwardMap = new Map();
  dryInwards.forEach((i: any) => inwardMap.set(i._id.toString(), i.lotNo ? `Lot: ${i.lotNo}` : i.receiptNumber));
  coldInwards.forEach((i: any) => inwardMap.set(i._id.toString(), i.lotNo ? `Lot: ${i.lotNo}` : i.receiptNumber));

  const pledgesWithInwardData = pledges.map((p: any) => ({
    ...p,
    items: p.items.map((item: any) => ({
      ...item,
      inwardLabel: inwardMap.get(item.inwardId.toString()) || item.inwardId.toString()
    }))
  }));

  return JSON.parse(JSON.stringify(pledgesWithInwardData));
}

export async function releasePledge(pledgeId: string) {
  await connectToDatabase();
  const session = await requireSession();

  const pledge = await Pledge.findOne({ _id: new mongoose.Types.ObjectId(pledgeId), ...getTenantFilterForMongo(session) }).lean();
  if (!pledge) throw new Error('Pledge not found');
  if (pledge.status === 'RELEASED') throw new Error('Pledge is already released');

  const itemsToRelease = pledge.items.map((item: any) => {
    const remainingQty = item.pledgedQuantity - (item.releasedQuantity || 0);
    const remainingBags = item.pledgedBags - (item.releasedBags || 0);
    return {
      inwardId: item.inwardId.toString(),
      releasedQuantity: remainingQty,
      releasedBags: remainingBags
    };
  }).filter((i: any) => i.releasedQuantity > 0 || i.releasedBags > 0);

  if (itemsToRelease.length === 0) {
    throw new Error('No remaining stock to release');
  }

  return await partialReleasePledge(pledgeId, itemsToRelease, 'Full Release');
}

export async function getTotalPledgedQuantity(clientId: string, commodityId: string, warehouseId: string, storageType: 'DRY' | 'COLD') {
  await connectToDatabase();
  
  const agg = await Pledge.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $in: ['ACTIVE', 'PARTIAL'] } } },
    { $unwind: '$items' },
    { 
      $match: { 
        'items.storageType': storageType,
        'items.commodityId': new mongoose.Types.ObjectId(commodityId),
        'items.warehouseId': new mongoose.Types.ObjectId(warehouseId)
      } 
    },
    { $group: { 
        _id: null, 
        totalMT: { $sum: { $subtract: ['$items.pledgedQuantity', { $ifNull: ['$items.releasedQuantity', 0] }] } },
        totalBags: { $sum: { $subtract: ['$items.pledgedBags', { $ifNull: ['$items.releasedBags', 0] }] } } 
    } }
  ]);
  
  return {
    pledgedMT: agg[0]?.totalMT || 0,
    pledgedBags: agg[0]?.totalBags || 0
  };
}

export async function partialReleasePledge(
  pledgeId: string, 
  itemsToRelease: { inwardId: string; releasedQuantity: number; releasedBags: number; }[], 
  remarks?: string, 
  releaseDateStr?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  await connectToDatabase();
  const session = await requireSession();

  const pledge = await Pledge.findOne({ _id: new mongoose.Types.ObjectId(pledgeId), ...getTenantFilterForMongo(session) }).populate('clientId');
  if (!pledge) throw new Error('Pledge not found');
  if (pledge.status === 'RELEASED') throw new Error('Pledge is already fully released');

  const previousValue = JSON.parse(JSON.stringify(pledge));
  const releaseDate = releaseDateStr ? new Date(releaseDateStr) : new Date();

  // Receipt Number Generation: PR-<PledgeNo>-<Index>
  const receiptNo = `${pledge.pledgeNo}-R${pledge.releaseHistory.length + 1}`;

  // Client Details
  const client: any = pledge.clientId;
  const clientName = client?.name || client?.clientName || 'Unknown';
  const clientLocation = client?.address || client?.village || client?.district || 'Unknown';
  const clientIdString = client?.customClientId || client?._id?.toString() || 'Unknown';

  let totalRemainingMT = 0;
  
  const receiptItems: any[] = [];

  for (const release of itemsToRelease) {
    const item = pledge.items.find((i: any) => i.inwardId.toString() === release.inwardId);
    if (!item) throw new Error(`Inward lot not found in pledge`);
    
    if (release.releasedQuantity <= 0) continue;

    const remainingQty = item.pledgedQuantity - (item.releasedQuantity || 0);
    const remainingBags = item.pledgedBags - (item.releasedBags || 0);

    if (release.releasedQuantity > remainingQty) {
      throw new Error(`Cannot release more than remaining pledged quantity`);
    }
    
    // Look up inward details for receipt
    let inwardRecord: any = null;
    let whName = 'Unknown', whAddr = 'Unknown', whCode = 'Unknown', commName = 'Unknown';
    if (item.storageType === 'DRY') {
      inwardRecord = await mongoose.models.Inward.findById(item.inwardId).populate('warehouseId').populate('commodityId');
    } else {
      inwardRecord = await mongoose.models.ColdInward.findById(item.inwardId).populate('warehouseId').populate('commodityId');
    }
    if (inwardRecord) {
      whName = inwardRecord.warehouseId?.name || 'Unknown';
      whAddr = inwardRecord.warehouseId?.address || inwardRecord.warehouseId?.village || 'Unknown';
      whCode = inwardRecord.warehouseId?.warehouseId || inwardRecord.warehouseId?.code || 'N/A';
      commName = inwardRecord.commodityId?.name || inwardRecord.commodityId?.commodityName || 'Unknown';
    }

    const previousReleasedMT = item.releasedQuantity || 0;
    const currentReleasedMT = release.releasedQuantity;
    const balanceNetWtMT = item.pledgedQuantity - previousReleasedMT - currentReleasedMT;

    receiptItems.push({
      inwardId: new mongoose.Types.ObjectId(item.inwardId),
      warehouseName: whName,
      warehouseAddress: whAddr,
      warehouseIdentifier: whCode,
      commodityName: commName,
      totalNetWtMT: item.pledgedQuantity,
      previousReleasedMT: previousReleasedMT,
      currentReleasedMT: currentReleasedMT,
      balanceNetWtMT: balanceNetWtMT,
      releasedQuantity: currentReleasedMT,
      releasedBags: release.releasedBags
    });

    item.releasedQuantity = (item.releasedQuantity || 0) + release.releasedQuantity;
    item.releasedBags = (item.releasedBags || 0) + release.releasedBags;
  }

  // Calculate total remaining across all items
  for (const item of pledge.items) {
    totalRemainingMT += (item.pledgedQuantity - (item.releasedQuantity || 0));
  }

  pledge.status = totalRemainingMT <= 0.001 ? 'RELEASED' : 'PARTIAL';
  
  if (pledge.status === 'RELEASED') {
    pledge.releaseDate = releaseDate;
  }

  pledge.releaseHistory.push({
    receiptNo,
    releaseDate,
    clientName,
    clientLocation,
    clientIdString,
    items: receiptItems,
    releasedBy: session.user.name || session.user.email || 'Unknown',
    remarks
  });

  await pledge.save();

  await logActivity({
    actionType: 'UPDATE',
    module: 'Pledge',
    recordId: pledge._id.toString(),
    description: `Partially released Pledge ${pledge.pledgeNo} (Receipt: ${receiptNo})`,
    previousValue,
    newValue: JSON.parse(JSON.stringify(pledge)),
    storageType: pledge.items[0]?.storageType === 'COLD' ? 'Cold Storage' : 'Dry Storage',
    sessionFallback: session
  });

  revalidatePath('/dashboard/pledges');
  return { success: true, data: JSON.parse(JSON.stringify(pledge)) };
}
