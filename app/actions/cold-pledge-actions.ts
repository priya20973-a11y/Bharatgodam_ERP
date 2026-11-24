'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import ColdPledge from '@/lib/models/ColdPledge';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import Client from '@/lib/models/Client';
import { getColdInwardAvailableStock } from '@/app/actions/cold-outward-actions';
import { requireSession, getTenantFilterForMongo, appendOwnershipForMongo } from '@/lib/ownership';
import { hasPermission } from '@/lib/permissions';
import { logColdActivity } from '@/lib/cold-logger';
import { revalidatePath } from 'next/cache';

export async function getColdClientsForPledge() {
  await connectToDatabase();
  const session = await requireSession();
  
  const tenantFilter = getTenantFilterForMongo(session);

  // Find all distinct clients who have inward stock in Cold Storage
  const clientIdsWithStock = await ColdInward.distinct('clientId', {
    ...tenantFilter,
    $or: [
      { remainingQuantityKg: { $gt: 0 } },
      { remainingQuantityKg: { $exists: false }, quantityKg: { $gt: 0 } }
    ]
  });

  const clientDocs = await Client.find({
    _id: { $in: clientIdsWithStock },
    ...tenantFilter
  })
    .sort({ name: 1 })
    .select('_id name mobile clientName')
    .lean();

  // If no clients with stock yet, also include all tenant clients for selection
  const allClients = clientDocs.length > 0
    ? clientDocs
    : await Client.find(tenantFilter).sort({ name: 1 }).select('_id name mobile clientName').lean();

  return allClients.map((c: any) => ({
    _id: c._id.toString(),
    id: c._id.toString(),
    name: c.name || c.clientName || 'Unknown',
    mobile: c.mobile || ''
  }));
}

export async function getColdInwardsForPledge(clientId: string) {
  await connectToDatabase();
  const session = await requireSession();
  
  const filter = { 
    clientId: new mongoose.Types.ObjectId(clientId),
    gradingApplied: true,
    ...getTenantFilterForMongo(session)
  };
  
  const coldInwardsRaw = await ColdInward.find(filter)
    .populate({ path: 'commodityId', model: ColdCommodity, select: 'name unit type' })
    .populate({ path: 'warehouseId', model: ColdWarehouse, select: 'name warehouseId' })
    .lean();

  // Get active / partial pledges from ColdPledge
  const activeColdPledges = await ColdPledge.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $in: ['ACTIVE', 'PARTIAL'] } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.inwardId',
        totalPledgedQuantity: {
          $sum: {
            $subtract: ['$items.pledgedQuantity', { $ifNull: ['$items.releasedQuantity', 0] }]
          }
        },
        totalPledgedBags: {
          $sum: {
            $subtract: ['$items.pledgedBags', { $ifNull: ['$items.releasedBags', 0] }]
          }
        }
      }
    }
  ]);

  // Also account for any legacy Pledge where storageType === 'COLD'
  let legacyActiveColdPledges: any[] = [];
  try {
    const Pledge = mongoose.models.Pledge || (await import('@/lib/models/Pledge')).default;
    legacyActiveColdPledges = await Pledge.aggregate([
      { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $in: ['ACTIVE', 'PARTIAL'] } } },
      { $unwind: '$items' },
      { $match: { 'items.storageType': 'COLD' } },
      {
        $group: {
          _id: '$items.inwardId',
          totalPledgedQuantity: {
            $sum: {
              $subtract: ['$items.pledgedQuantity', { $ifNull: ['$items.releasedQuantity', 0] }]
            }
          },
          totalPledgedBags: {
            $sum: {
              $subtract: ['$items.pledgedBags', { $ifNull: ['$items.releasedBags', 0] }]
            }
          }
        }
      }
    ]);
  } catch (err) {
    console.warn('Legacy pledge query skipped:', err);
  }

  const pledgeMap = new Map<string, { totalPledgedQuantity: number; totalPledgedBags: number }>();
  
  activeColdPledges.forEach((p: any) => {
    pledgeMap.set(p._id.toString(), {
      totalPledgedQuantity: p.totalPledgedQuantity || 0,
      totalPledgedBags: p.totalPledgedBags || 0
    });
  });

  legacyActiveColdPledges.forEach((p: any) => {
    const key = p._id.toString();
    const existing = pledgeMap.get(key) || { totalPledgedQuantity: 0, totalPledgedBags: 0 };
    pledgeMap.set(key, {
      totalPledgedQuantity: existing.totalPledgedQuantity + (p.totalPledgedQuantity || 0),
      totalPledgedBags: existing.totalPledgedBags + (p.totalPledgedBags || 0)
    });
  });

  // Deduct real outward quantities
  const outwardAgg = await ColdOutward.aggregate([
    { $match: { inwardId: { $in: coldInwardsRaw.map((i: any) => i._id) }, isCarryOver: { $ne: true } } },
    {
      $group: {
        _id: '$inwardId',
        totalOutKg: { $sum: '$quantityKg' },
        totalOutBags: { $sum: '$bagsCount' },
      },
    },
  ]);
  const outwardMap = new Map();
  outwardAgg.forEach((o: any) => outwardMap.set(o._id.toString(), { outKg: o.totalOutKg || 0, outBags: o.totalOutBags || 0 }));

  const result = coldInwardsRaw.map((inward: any) => {
    const pledgeData = pledgeMap.get(inward._id.toString()) || { totalPledgedQuantity: 0, totalPledgedBags: 0 };
    const outData = outwardMap.get(inward._id.toString()) || { outKg: 0, outBags: 0 };

    const physicalRemainingKg = Math.max(0, (Number(inward.quantityKg) || 0) - outData.outKg);
    const physicalRemainingBags = Math.max(0, (Number(inward.bagsCount) || 0) - outData.outBags);

    const availableForPledgeKg = Math.max(0, physicalRemainingKg - pledgeData.totalPledgedQuantity);
    const availableForPledgeBags = Math.max(0, physicalRemainingBags - pledgeData.totalPledgedBags);

    const expiryDate = inward.assayingExpiryDate 
      ? new Date(inward.assayingExpiryDate).toISOString() 
      : (inward.expiryDate ? new Date(inward.expiryDate).toISOString() : null);

    const stackLocations = Array.isArray(inward.stackAllocations) && inward.stackAllocations.length > 0
      ? inward.stackAllocations.map((sa: any) => `Ch: ${sa.chamberName || sa.chamberNo} F: ${sa.floorNo} S: ${sa.stackNo}`).join(', ')
      : '';

    return {
      ...inward,
      storageType: 'COLD',
      commodityName: inward.commodityId?.name || 'Unknown Commodity',
      warehouseName: inward.warehouseId?.name || 'Cold Warehouse',
      stackLocations,
      pledgedQuantity: pledgeData.totalPledgedQuantity,
      pledgedBags: pledgeData.totalPledgedBags,
      physicalRemainingKg,
      physicalRemainingBags,
      availableForPledgeKg,
      availableForPledgeBags,
      // Also provide MT conversion for standard UI compatibility
      availableForPledgeMT: Math.max(0, Number((availableForPledgeKg / 1000).toFixed(4))),
      assayingExpiryDate: expiryDate,
      expiryDate: expiryDate,
      gradingApplied: inward.gradingApplied === true,
    };
  }).filter((i: any) => i.availableForPledgeKg > 0);

  return JSON.parse(JSON.stringify(result));
}

export async function createColdPledge(data: {
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
    storageType?: 'COLD';
    commodityId: string;
    warehouseId: string;
    chamberName?: string;
    floorNo?: number;
    stackNo?: number;
    pledgedQuantity: number; // in KG
    pledgedBags: number;
  }[];
}) {
  await connectToDatabase();
  const session = await requireSession();

  if (!hasPermission(session, 'pledge', 'create')) {
    throw new Error('Forbidden: Insufficient permissions');
  }

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

    // Backend validation: Ensure every selected stock lot has an expiry date, Repayment Date <= Expiry Date, and sufficient available unpledged stock
    for (const item of data.items) {
      const stockInfo = await getColdInwardAvailableStock(item.inwardId);
      if (!stockInfo.found || !stockInfo.inward) {
        return { success: false, error: 'Selected Cold Storage inward stock record not found.' };
      }

      const inwardRecord = stockInfo.inward;

      if (item.pledgedQuantity <= 0 || isNaN(item.pledgedQuantity)) {
        return { success: false, error: 'Pledged quantity must be a valid number greater than 0.' };
      }

      if (item.pledgedQuantity > stockInfo.availableStockKg) {
        const lotLabel = inwardRecord.lotNo ? `Lot: ${inwardRecord.lotNo}` : (inwardRecord.receiptNumber || 'Selected inward stock');
        return {
          success: false,
          error: `Pledge quantity (${item.pledgedQuantity} Kg) exceeds available unpledged stock (${stockInfo.availableStockKg} Kg) for ${lotLabel}.`,
        };
      }

      const inwardExpiry = inwardRecord.assayingExpiryDate || (inwardRecord as any).expiryDate;
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
      pledgeNo: data.pledgeNo.trim(),
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
        storageType: 'COLD',
        commodityId: new mongoose.Types.ObjectId(i.commodityId),
        warehouseId: new mongoose.Types.ObjectId(i.warehouseId),
        chamberName: i.chamberName,
        floorNo: i.floorNo,
        stackNo: i.stackNo,
        pledgedQuantity: i.pledgedQuantity,
        pledgedBags: i.pledgedBags,
        releasedQuantity: 0,
        releasedBags: 0,
      }))
    }, session);

    const pledge = await ColdPledge.create(pledgeData);

    await logColdActivity({
      actionType: 'CREATE',
      module: 'Pledge',
      recordId: pledge._id.toString(),
      description: `Created Cold Storage Pledge ${pledge.pledgeNo} for ${data.lenderName}`,
      newValue: JSON.parse(JSON.stringify(pledge)),
      sessionFallback: session
    });

    revalidatePath('/cold/pledges');
    revalidatePath('/cold/outward');
    return { success: true, data: JSON.parse(JSON.stringify(pledge)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Pledge Number already exists.' };
    }
    return { success: false, error: error.message };
  }
}

export async function getColdPledges() {
  await connectToDatabase();
  const session = await requireSession();
  
  const pledges = await ColdPledge.find(getTenantFilterForMongo(session))
    .populate('clientId', 'name')
    .sort({ createdAt: -1 })
    .lean();
    
  // Fetch receipt / lot numbers for inward lots
  const inwardIds: any[] = [];
  for (const p of pledges) {
    for (const item of p.items) {
      if (item.inwardId) inwardIds.push(item.inwardId);
    }
  }

  const coldInwards = await ColdInward.find({ _id: { $in: inwardIds } })
    .select('receiptNumber lotNo')
    .lean();

  const inwardMap = new Map();
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

export async function releaseColdPledge(pledgeId: string) {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'pledge', 'edit')) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  const pledge = await ColdPledge.findOne({ 
    _id: new mongoose.Types.ObjectId(pledgeId), 
    ...getTenantFilterForMongo(session) 
  }).lean();
  
  if (!pledge) throw new Error('Cold Storage Pledge not found');
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

  return await partialReleaseColdPledge(pledgeId, itemsToRelease, 'Full Release');
}

export async function partialReleaseColdPledge(
  pledgeId: string, 
  itemsToRelease: { inwardId: string; releasedQuantity: number; releasedBags: number; }[], 
  remarks?: string, 
  releaseDateStr?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'pledge', 'edit')) {
    throw new Error('Forbidden: Insufficient permissions');
  }

  const pledge = await ColdPledge.findOne({ 
    _id: new mongoose.Types.ObjectId(pledgeId), 
    ...getTenantFilterForMongo(session) 
  }).populate('clientId');

  if (!pledge) throw new Error('Cold Storage Pledge not found');
  if (pledge.status === 'RELEASED') throw new Error('Pledge is already fully released');

  const previousValue = JSON.parse(JSON.stringify(pledge));
  const releaseDate = releaseDateStr ? new Date(releaseDateStr) : new Date();

  // Receipt Number Generation: PR-<PledgeNo>-R<Index>
  const receiptNo = `${pledge.pledgeNo}-R${pledge.releaseHistory.length + 1}`;

  // Client Details
  const client: any = pledge.clientId;
  const clientName = client?.name || client?.clientName || 'Unknown';
  const clientLocation = client?.address || client?.village || client?.district || 'Unknown';
  const clientIdString = client?.customClientId || client?._id?.toString() || 'Unknown';

  let totalRemainingKg = 0;
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
    const inwardRecord: any = await ColdInward.findById(item.inwardId)
      .populate({ path: 'warehouseId', model: ColdWarehouse })
      .populate({ path: 'commodityId', model: ColdCommodity });

    let whName = 'Cold Warehouse', whAddr = 'Unknown', whCode = 'N/A', commName = 'Unknown';
    if (inwardRecord) {
      whName = inwardRecord.warehouseId?.name || 'Cold Warehouse';
      whAddr = inwardRecord.warehouseId?.location || inwardRecord.warehouseId?.address || 'Unknown';
      whCode = inwardRecord.warehouseId?.warehouseId || inwardRecord.warehouseId?.code || 'N/A';
      commName = inwardRecord.commodityId?.name || 'Unknown';
    }

    const previousReleasedKg = item.releasedQuantity || 0;
    const currentReleasedKg = release.releasedQuantity;
    const balanceNetWtKg = item.pledgedQuantity - previousReleasedKg - currentReleasedKg;

    receiptItems.push({
      inwardId: new mongoose.Types.ObjectId(item.inwardId),
      warehouseName: whName,
      warehouseAddress: whAddr,
      warehouseIdentifier: whCode,
      commodityName: commName,
      totalNetWtKg: item.pledgedQuantity,
      previousReleasedKg,
      currentReleasedKg,
      balanceNetWtKg,
      releasedQuantity: currentReleasedKg,
      releasedBags: release.releasedBags
    });

    item.releasedQuantity = (item.releasedQuantity || 0) + release.releasedQuantity;
    item.releasedBags = (item.releasedBags || 0) + release.releasedBags;
  }

  // Calculate total remaining across all items
  for (const item of pledge.items) {
    totalRemainingKg += (item.pledgedQuantity - (item.releasedQuantity || 0));
  }

  pledge.status = totalRemainingKg <= 0.001 ? 'RELEASED' : 'PARTIAL';
  
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

  await logColdActivity({
    actionType: 'UPDATE',
    module: 'Pledge',
    recordId: pledge._id.toString(),
    description: `Partially released Cold Storage Pledge ${pledge.pledgeNo} (Receipt: ${receiptNo})`,
    previousValue,
    newValue: JSON.parse(JSON.stringify(pledge)),
    sessionFallback: session
  });

  revalidatePath('/cold/pledges');
  revalidatePath('/cold/outward');
  return { success: true, data: JSON.parse(JSON.stringify(pledge)) };
}

export async function getColdTotalPledgedQuantity(clientId: string, commodityId: string, warehouseId: string) {
  await connectToDatabase();
  
  const agg = await ColdPledge.aggregate([
    { $match: { clientId: new mongoose.Types.ObjectId(clientId), status: { $in: ['ACTIVE', 'PARTIAL'] } } },
    { $unwind: '$items' },
    { 
      $match: { 
        'items.commodityId': new mongoose.Types.ObjectId(commodityId),
        'items.warehouseId': new mongoose.Types.ObjectId(warehouseId)
      } 
    },
    { 
      $group: { 
        _id: null, 
        totalKg: { $sum: { $subtract: ['$items.pledgedQuantity', { $ifNull: ['$items.releasedQuantity', 0] }] } },
        totalBags: { $sum: { $subtract: ['$items.pledgedBags', { $ifNull: ['$items.releasedBags', 0] }] } } 
      } 
    }
  ]);
  
  return {
    pledgedKg: agg[0]?.totalKg || 0,
    pledgedBags: agg[0]?.totalBags || 0
  };
}
