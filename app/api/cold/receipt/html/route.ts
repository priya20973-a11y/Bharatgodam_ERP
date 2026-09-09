import { NextRequest, NextResponse } from 'next/server';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import '@/lib/models/Client';
import '@/lib/models/ColdCommodity';
import '@/lib/models/ColdWarehouse';
import { generateColdTransactionReceiptHTML } from '@/lib/invoice/cold-transaction-receipt';
import { generateColdOutwardReceiptHTML } from '@/lib/invoice/cold-outward-receipt';
import { generateColdTransferReceiptHTML } from '@/lib/invoice/cold-transfer-receipt';
import ColdTransfer from '@/lib/models/ColdTransfer';
import ColdStockShifting from '@/lib/models/ColdStockShifting';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';

import { hasPermission } from '@/lib/permissions';
import { generateColdDynamicReceiptHTML } from '@/lib/invoice/cold-dynamic-receipt';
import ReceiptTemplate from '@/lib/models/ReceiptTemplate';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();
    
    const id = request.nextUrl.searchParams.get('id');
    const batchId = request.nextUrl.searchParams.get('batchId');
    const type = request.nextUrl.searchParams.get('type') as 'inward' | 'outward' | 'transfer';
    
    if ((!id && !batchId) || (type !== 'inward' && type !== 'outward' && type !== 'transfer')) {
      return new NextResponse('Invalid parameters', { status: 400 });
    }
    
    if (type === 'transfer' && !hasPermission(session, 'ownershipTransfer', 'print')) {
      return new NextResponse('Forbidden: No print permission for ownership transfer', { status: 403 });
    }
    
    let transaction: any;
    let transactions: any[] = [];
    
    if (type === 'inward') {
      transaction = await ColdInward.findOne({ _id: id, ...getTenantFilterForMongo(session) })
        .populate('clientId', 'name address village')
        .populate('commodityId', 'name type seasonalPrices')
        .populate('warehouseId');
        
      if (transaction) {
        const shiftings = await ColdStockShifting.find({ inwardId: transaction._id }).lean();
        const cleanStr = (val: any) => String(val || '').toLowerCase().replace(/^(chamber|floor|stack|c|f|s)\s*/i, '').trim();

        if (transaction.stackAllocations) {
          transaction = JSON.parse(JSON.stringify(transaction));
          const isPurchaseClient = transaction.clientId?.clientType === 'PURCHASE';
          
          if (isPurchaseClient) {
            transaction.stockType = 'Purchase';
            transaction.purchaseQuantityKg = transaction.quantityKg;
            transaction.purchaseBagsCount = transaction.totalBags || transaction.bagsCount;
            transaction.selfQuantityKg = 0;
            transaction.selfBagsCount = 0;
          }

          transaction.stacksInfo = transaction.stackAllocations.map((a: any) => {
            let floorName = a.floorNo;
            if (transaction.warehouseId?.chambers) {
              const chamber = transaction.warehouseId.chambers.find((c: any) => c.chamberNo === parseInt(a.chamberNo || '1') || c.name === a.chamberName);
              const floor = chamber?.floors?.find((f: any) => f.floorNo === parseInt(a.floorNo));
              if (floor?.name) floorName = floor.name;
            }

            const cClean = cleanStr(a.chamberName || a.chamberNo);
            const isShifted = a.isStockShifting === true || shiftings.some((sh: any) =>
              (sh.destAllocations || []).some((dest: any) => cleanStr(dest.chamberName || dest.chamberNo) === cClean && dest.floorNo === a.floorNo && dest.stackNo === a.stackNo)
            );

            return {
              chamberNo: a.chamberName || a.chamberNo,
              floorNo: floorName,
              stackNo: a.stackNo,
              quantityKg: a.allocatedWeight,
              bagsCount: a.bagsCount,
              stockType: isPurchaseClient ? 'Purchase' : (a.stockType || 'Self'),
              isStockShifting: isShifted,
            };
          });
        }
      }
    } else if (type === 'outward') {
      if (batchId) {
        transactions = await ColdOutward.find({ batchId, ...getTenantFilterForMongo(session) })
          .populate('inwardId', 'receiptNo _id date')
          .populate('clientId', 'name address village')
          .populate('commodityId', 'name type unit rentCalculationOn seasonalPrices priceType rentType gradingType')
          .populate('warehouseId');
        if (transactions.length > 0) {
          transaction = transactions[0]; // For common fields
        }
      } else {
        transaction = await ColdOutward.findOne({ _id: id, ...getTenantFilterForMongo(session) })
          .populate('inwardId', 'receiptNo _id date')
          .populate('clientId', 'name address village')
          .populate('commodityId', 'name type unit rentCalculationOn seasonalPrices priceType rentType gradingType')
          .populate('warehouseId');
        if (transaction) {
          if (transaction.batchId) {
            transactions = await ColdOutward.find({ batchId: transaction.batchId, ...getTenantFilterForMongo(session) })
              .populate('inwardId', 'receiptNo _id date')
              .populate('clientId', 'name address village')
              .populate('commodityId', 'name type unit rentCalculationOn seasonalPrices priceType rentType gradingType')
              .populate('warehouseId');
          } else {
            // Group transactions created at the same time for the same client
            const timeWindow = 60 * 1000; // 1 minute
            const startTime = new Date(transaction.createdAt.getTime() - timeWindow);
            const endTime = new Date(transaction.createdAt.getTime() + timeWindow);
            
            transactions = await ColdOutward.find({
              clientId: transaction.clientId,
              createdAt: { $gte: startTime, $lte: endTime },
              ...getTenantFilterForMongo(session)
            })
              .populate('inwardId', 'receiptNo _id date')
              .populate('clientId', 'name address village')
              .populate('commodityId', 'name type unit rentCalculationOn seasonalPrices priceType rentType gradingType')
              .populate('warehouseId')
              .sort({ createdAt: 1 });
          }
        }
      }

      transactions = JSON.parse(JSON.stringify(transactions));
      transactions.forEach((tx: any) => {
        if (tx.warehouseId?.chambers) {
          const chamber = tx.warehouseId.chambers.find((c: any) => c.chamberNo === parseInt(tx.chamberNo || '1') || c.name === tx.chamberName);
          const floor = chamber?.floors?.find((f: any) => f.floorNo === parseInt(tx.floorNo));
          if (floor?.name) tx.floorNo = floor.name;
        }
      });
    } else if (type === 'transfer') {
      transaction = await ColdTransfer.findOne({ _id: id, ...getTenantFilterForMongo(session) })
        .populate('fromClientId', 'name address village')
        .populate('toClientId', 'name address village')
        .populate('commodityId', 'name type unit rentCalculationOn seasonalPrices priceType rentType gradingType')
        .populate('warehouseId')
        .populate('originalInwardId', 'farmerName farmerId referencePersons quantityKg');
    }
    
    if (!transaction && transactions.length === 0) {
      return new NextResponse('Transaction not found', { status: 404 });
    }
    
    const db = await getDb();
    
    // Resolve correct WSP ID: if STAFF, use staffId instead of own user id
    const isStaff = (session.user as any).isStaff;
    const userId = isStaff ? (session.user as any).staffId : session.user.id;
    
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });

    // Parse Mongoose document to plain JSON
    const data = JSON.parse(JSON.stringify(transaction));
    const batchData = JSON.parse(JSON.stringify(transactions));
    
    if (type === 'transfer' && data?.originalInwardId) {
      data.farmerName = data.originalInwardId.farmerName || '';
      data.farmerId = data.originalInwardId.farmerId || '';
      data.referencePersons = data.originalInwardId.referencePersons || [];
      
      // Calculate remaining weight on the original inward
      const allOutwards = await ColdOutward.find({ inwardId: data.originalInwardId._id });
      const totalOutwardKg = allOutwards.reduce((sum, out) => sum + (out.quantityKg || 0), 0);
      data.outwardWeight = data.quantityKg; // The weight being transferred is the outward weight from this transaction
      data.remainingWeight = Math.max(0, (data.originalInwardId.quantityKg || 0) - totalOutwardKg);
    }
    
    const warehouseData = type === 'inward' ? data?.warehouseId : (batchData.length > 0 ? batchData[0].warehouseId : data?.warehouseId);
    
    let userLogo = '';
    if (warehouseData?.warehouseLogo) {
      userLogo = warehouseData.warehouseLogo;
    }

    const userDetails = {
      companyLogo: userLogo,
      phoneNumber: dbUser?.phoneNumber || session.user.phoneNumber || '',
    };
    
    const lang = (session.user as any)?.coldLanguage === 'gu' ? 'gu' : 'en';
    
    // Fetch dynamic template for this warehouse
    let dynamicTemplate = null;
    if (warehouseData?._id) {
      dynamicTemplate = await ReceiptTemplate.findOne({
        warehouseId: warehouseData._id,
        receiptType: type
      }).lean();
    }

    let html = '';
    
    if (dynamicTemplate) {
      if (type === 'outward' && batchData && batchData.length > 0) {
        html = batchData.map((tx: any) => generateColdDynamicReceiptHTML(tx, dynamicTemplate, type)).join('<div style="page-break-after: always;"></div>');
      } else {
        html = generateColdDynamicReceiptHTML(data, dynamicTemplate, type);
      }
    } else {
      // Fallback to existing standard templates
      if (type === 'inward') {
        html = generateColdTransactionReceiptHTML(data, 'inward', userDetails, lang);
      } else if (type === 'outward') {
        if (batchData && batchData.length > 0) {
          html = batchData.map((tx: any) => generateColdOutwardReceiptHTML(tx, userDetails, lang)).join('<div style="page-break-after: always;"></div>');
        } else {
          html = generateColdOutwardReceiptHTML(data, userDetails, lang);
        }
      } else if (type === 'transfer') {
        html = generateColdTransferReceiptHTML(data, userDetails, lang);
      }
    }
    
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('Error generating cold receipt:', error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}
