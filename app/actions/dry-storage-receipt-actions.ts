'use server';

import connectToDatabase from '@/lib/mongoose';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import Client from '@/lib/models/Client';
import Commodity from '@/lib/models/Commodity';
import Warehouse from '@/lib/models/Warehouse';
import { requireSession, getTenantFilterForMongo, getTenantFilter } from '@/lib/ownership';
import mongoose from 'mongoose';

export async function getDryStorageReceiptData(id: string, recordType?: 'inward' | 'outward') {
  await connectToDatabase();
  const session = await requireSession();

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error('Invalid record ID');
  }

  const tenantFilter = getTenantFilterForMongo(session);

  let inward: any = null;
  let outward: any = null;
  let isWithdrawal = false;

  const db = mongoose.connection.db;

  // 1. Check if id is a transaction collection record
  let matchingTx: any = null;
  if (db) {
    try {
      matchingTx = await db.collection('transactions').findOne({
        _id: new mongoose.Types.ObjectId(id),
      });
    } catch (e) {
      // ignore
    }
  }

  const resolvedSourceId = matchingTx?.sourceId || id;
  const isTxOutward = matchingTx && (matchingTx.sourceType === 'outward' || (matchingTx.direction || '').toUpperCase() === 'OUTWARD');

  // 2. Fetch primary document (Inward or Outward)
  if (recordType === 'outward' || isTxOutward) {
    if (mongoose.Types.ObjectId.isValid(resolvedSourceId)) {
      outward = await Outward.findOne({ _id: resolvedSourceId, ...tenantFilter })
        .populate({ path: 'clientId', model: Client })
        .populate({ path: 'commodityId', model: Commodity })
        .populate({ path: 'warehouseId', model: Warehouse })
        .lean();
    }
    isWithdrawal = true;
  } else if (recordType === 'inward') {
    if (mongoose.Types.ObjectId.isValid(resolvedSourceId)) {
      inward = await Inward.findOne({ _id: resolvedSourceId, ...tenantFilter })
        .populate({ path: 'clientId', model: Client })
        .populate({ path: 'commodityId', model: Commodity })
        .populate({ path: 'warehouseId', model: Warehouse })
        .lean();
    }
    isWithdrawal = false;
  } else {
    // Auto-detect
    if (mongoose.Types.ObjectId.isValid(resolvedSourceId)) {
      inward = await Inward.findOne({ _id: resolvedSourceId, ...tenantFilter })
        .populate({ path: 'clientId', model: Client })
        .populate({ path: 'commodityId', model: Commodity })
        .populate({ path: 'warehouseId', model: Warehouse })
        .lean();

      if (!inward) {
        outward = await Outward.findOne({ _id: resolvedSourceId, ...tenantFilter })
          .populate({ path: 'clientId', model: Client })
          .populate({ path: 'commodityId', model: Commodity })
          .populate({ path: 'warehouseId', model: Warehouse })
          .lean();
        if (outward) isWithdrawal = true;
      }
    }
  }

  // 3. Fallback: if not in inward/outward collection, use matchingTx as primary doc
  if (!inward && !outward && matchingTx) {
    if (isTxOutward) {
      outward = matchingTx;
      isWithdrawal = true;
    } else {
      inward = matchingTx;
    }
  }

  const primaryDoc = outward || inward;
  if (!primaryDoc) {
    throw new Error('Transaction record not found');
  }

  // 4. Always fetch corresponding transaction record from transactions collection if not already loaded
  if (!matchingTx && db) {
    try {
      const docIdStr = primaryDoc._id?.toString?.() || id;
      matchingTx = await db.collection('transactions').findOne({
        $or: [
          { sourceId: docIdStr },
          { _id: new mongoose.Types.ObjectId(id) },
          { _id: primaryDoc._id }
        ]
      });
    } catch (e) {
      // ignore
    }
  }

  // 5. Merge transaction-level fields onto the record (ensures packagingMaterial, packagingSize, gslNo are never missing)
  const packagingMaterial = primaryDoc.packagingMaterial || matchingTx?.packagingMaterial || primaryDoc.packaging || matchingTx?.packaging || '';
  const packagingSize = primaryDoc.packagingSize || matchingTx?.packagingSize || primaryDoc.packageSize || matchingTx?.packageSize || '';
  const gslNo = primaryDoc.gslNo || matchingTx?.gslNo || primaryDoc.gslNumber || matchingTx?.gslNumber || '';
  const variety = primaryDoc.variety || matchingTx?.variety || '';
  const rsnNo = primaryDoc.rsnNo || matchingTx?.rsnNo || primaryDoc.rstNo || matchingTx?.rstNo || '';
  const vehicleNumber = primaryDoc.vehicleNumber || matchingTx?.vehicleNumber || '';
  const agentName = primaryDoc.agentName || matchingTx?.agentName || '';
  const authorityPerson = primaryDoc.authorityPerson || matchingTx?.authorityPerson || '';
  const inTime = primaryDoc.inTime || matchingTx?.inTime || '';
  const outTime = primaryDoc.outTime || matchingTx?.outTime || '';
  const grossWeight = primaryDoc.grossWeight ?? matchingTx?.grossWeight;
  const tareWeight = primaryDoc.tareWeight ?? matchingTx?.tareWeight;
  const netWeight = primaryDoc.netWeight ?? matchingTx?.netWeight;
  const moisture = primaryDoc.moisture || matchingTx?.moisture || '';
  const deliveryOrderNo = primaryDoc.deliveryOrderNo || matchingTx?.deliveryOrderNo || '';
  const idProofNo = primaryDoc.idProofNo || matchingTx?.idProofNo || '';
  const notes = primaryDoc.notes || matchingTx?.notes || primaryDoc.note || matchingTx?.note || '';
  const dailyReportSrNo = primaryDoc.dailyReportSrNo || matchingTx?.dailyReportSrNo || '';
  const gatePassNo = primaryDoc.gatePassNo || primaryDoc.gatePass || matchingTx?.gatePassNo || matchingTx?.gatePass || '';

  const mergedRecord = {
    ...(matchingTx || {}),
    ...(primaryDoc || {}),
    packagingMaterial,
    packagingSize,
    gslNo,
    variety,
    rsnNo,
    vehicleNumber,
    agentName,
    authorityPerson,
    inTime,
    outTime,
    grossWeight,
    tareWeight,
    netWeight,
    moisture,
    deliveryOrderNo,
    idProofNo,
    notes,
    dailyReportSrNo,
    gatePassNo,
  };

  if (isWithdrawal) {
    outward = mergedRecord;
  } else {
    inward = mergedRecord;
  }

  // Ensure warehouse, client, commodity exist or fallback
  let warehouse = primaryDoc.warehouseId || {};
  let client = primaryDoc.clientId || {};
  let commodity = primaryDoc.commodityId || {};

  // If warehouse / client / commodity are ObjectIds, populate them if db is available
  if (db) {
    if (warehouse && typeof warehouse === 'object' && !warehouse.name && warehouse._id) {
      warehouse = await db.collection('warehouses').findOne({ _id: warehouse._id }) || warehouse;
    } else if (warehouse && typeof warehouse !== 'object') {
      warehouse = await db.collection('warehouses').findOne({ _id: new mongoose.Types.ObjectId(warehouse) }) || { _id: warehouse };
    }

    if (client && typeof client === 'object' && !client.name && client._id) {
      client = await db.collection('clients').findOne({ _id: client._id }) || client;
    } else if (client && typeof client !== 'object') {
      client = await db.collection('clients').findOne({ _id: new mongoose.Types.ObjectId(client) }) || { _id: client };
    }

    if (commodity && typeof commodity === 'object' && !commodity.name && commodity._id) {
      commodity = await db.collection('commodities').findOne({ _id: commodity._id }) || commodity;
    } else if (commodity && typeof commodity !== 'object') {
      commodity = await db.collection('commodities').findOne({ _id: new mongoose.Types.ObjectId(commodity) }) || { _id: commodity };
    }
  }

  let userDoc = null;
  if (session?.user?.id && db) {
    userDoc = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(session.user.id) });
  }

  return JSON.parse(JSON.stringify({
    inward,
    outward,
    warehouse,
    client,
    commodity,
    userDoc,
    isWithdrawal,
  }));
}

export async function getRecentDryInwards(limit = 25) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  const inwards = await Inward.find(tenantFilter)
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .populate({ path: 'clientId', model: Client, select: 'name mobile address customClientId' })
    .populate({ path: 'commodityId', model: Commodity, select: 'name' })
    .populate({ path: 'warehouseId', model: Warehouse, select: 'name address warehouseLogo logo' })
    .lean();

  return JSON.parse(JSON.stringify(inwards));
}

export async function getRecentDryOutwards(limit = 25) {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = getTenantFilter(session);

  const outwards = await Outward.find(tenantFilter)
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
    .populate({ path: 'clientId', model: Client, select: 'name mobile address customClientId' })
    .populate({ path: 'commodityId', model: Commodity, select: 'name' })
    .populate({ path: 'warehouseId', model: Warehouse, select: 'name address warehouseLogo logo' })
    .lean();

  return JSON.parse(JSON.stringify(outwards));
}

