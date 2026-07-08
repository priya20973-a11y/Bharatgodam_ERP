import { NextRequest, NextResponse } from 'next/server';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import { generateColdTransactionReceiptHTML } from '@/lib/invoice/cold-transaction-receipt';
import { generateColdOutwardReceiptHTML } from '@/lib/invoice/cold-outward-receipt';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();
    
    const id = request.nextUrl.searchParams.get('id');
    const batchId = request.nextUrl.searchParams.get('batchId');
    const type = request.nextUrl.searchParams.get('type') as 'inward' | 'outward';
    
    if ((!id && !batchId) || (type !== 'inward' && type !== 'outward')) {
      return new NextResponse('Invalid parameters', { status: 400 });
    }
    
    let transaction;
    let transactions: any[] = [];
    
    if (type === 'inward') {
      transaction = await ColdInward.findOne({ _id: id, ...getTenantFilter(session) })
        .populate('clientId', 'name address village')
        .populate('commodityId', 'name type')
        .populate('warehouseId');
    } else {
      if (batchId) {
        transactions = await ColdOutward.find({ batchId, ...getTenantFilter(session) })
          .populate('inwardId', 'receiptNo _id')
          .populate('clientId', 'name address village')
          .populate('commodityId', 'name type')
          .populate('warehouseId');
        if (transactions.length > 0) {
          transaction = transactions[0]; // For common fields
        }
      } else {
        transaction = await ColdOutward.findOne({ _id: id, ...getTenantFilter(session) })
          .populate('inwardId', 'receiptNo _id')
          .populate('clientId', 'name address village')
          .populate('commodityId', 'name type')
          .populate('warehouseId');
        if (transaction) {
          transactions = [transaction];
        }
      }
    }
    
    if (!transaction) {
      return new NextResponse('Transaction not found', { status: 404 });
    }
    
    const db = await getDb();
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(session.user.id) });

    // Parse Mongoose document to plain JSON
    const data = JSON.parse(JSON.stringify(transaction));
    const batchData = JSON.parse(JSON.stringify(transactions));
    
    const userDetails = {
      companyLogo: dbUser?.companyLogo || '',
      phoneNumber: session.user.phoneNumber || dbUser?.phoneNumber || '',
    };
    
    const language = (session.user as any).coldLanguage || 'en';
    
    let html = '';
    if (type === 'outward') {
      html = generateColdOutwardReceiptHTML(batchData, userDetails, language);
    } else {
      html = generateColdTransactionReceiptHTML(data, type, userDetails, language);
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
