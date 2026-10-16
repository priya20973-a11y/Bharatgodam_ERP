import { NextRequest, NextResponse } from 'next/server';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import Pledge from '@/lib/models/Pledge';
import Pledgee from '@/lib/models/Pledgee';
import Client from '@/lib/models/Client';
import Commodity from '@/lib/models/Commodity';
import Warehouse from '@/lib/models/Warehouse';
import Assayer from '@/lib/models/Assayer';
import mongoose from 'mongoose';
import { generateDynamicStorageReceiptHTML } from '@/lib/invoice/dynamic-storage-receipt';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    // const session: any = { user: { id: '000000000000000000000000' } };
    await connectToDatabase();
    
    const id = request.nextUrl.searchParams.get('id');
    
    if (!id) {
      return new NextResponse('Invalid parameters', { status: 400 });
    }
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return new NextResponse('Invalid receipt ID format', { status: 400 });
    }
    
    const tenantFilter = getTenantFilterForMongo(session);
    // const tenantFilter = {};
    
    // Fetch Inward with full populations
    let inward = await Inward.findOne({ _id: id, ...tenantFilter })
      .populate({ path: 'clientId', model: Client })
      .populate({ path: 'commodityId', model: Commodity })
      .populate({ path: 'warehouseId', model: Warehouse })
      .populate({ path: 'assayerId', model: Assayer })
      .lean();
      
    if (!inward) {
      // It might be a transaction ID, try to get the inward via sourceId
      try {
        const tx = await mongoose.connection.db?.collection('transactions').findOne({ _id: new mongoose.Types.ObjectId(id) });
        if (tx && tx.sourceId) {
          inward = await Inward.findOne({ _id: tx.sourceId, ...tenantFilter })
            .populate({ path: 'clientId', model: Client })
            .populate({ path: 'commodityId', model: Commodity })
            .populate({ path: 'warehouseId', model: Warehouse })
            .populate({ path: 'assayerId', model: Assayer })
            .lean();
        }
      } catch (e) {
        console.log('Transaction fallback error:', e);
      }
    }

    if (!inward) {
      return new NextResponse('Receipt/Inward not found', { status: 404 });
    }

    if (!(inward as any).notes && !(inward as any).note) {
      try {
        const tx = await mongoose.connection.db?.collection('transactions').findOne({
          $or: [
            { sourceId: inward._id.toString() },
            { _id: inward._id }
          ]
        });
        if (tx && (tx.notes || tx.note)) {
          (inward as any).notes = tx.notes || tx.note;
          (inward as any).note = tx.note || tx.notes;
        }
      } catch (e) {
        // ignore fallback check
      }
    }

    const inwardId = inward._id;

    // Fetch Outwards (Withdrawal History)
    const outwards = await Outward.find({ inwardId, ...tenantFilter }).sort({ date: 1 }).lean();

    // Fetch Pledge Detail
    let pledge = null;
    try {
      pledge = await Pledge.findOne({ 'items.inwardId': inwardId, ...tenantFilter })
        .populate({ path: 'lenderId', model: Pledgee })
        .lean();
    } catch (e) {
      console.log('Pledge model fetch error:', e);
    }

    const db = mongoose.connection.db;
    let userDoc = null;
    if (session?.user?.id && db) {
      userDoc = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(session.user.id) });
    }

    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const host = request.headers.get('host');
    const baseUrl = `${protocol}://${host}`;

    const html = await generateDynamicStorageReceiptHTML({
      inward,
      outwards,
      pledge,
      insurances: (inward.warehouseId as any)?.insurances || [],
      userDoc,
      baseUrl
    });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });

  } catch (error: any) {
    console.error('Error generating receipt HTML:', error);
    return new NextResponse(`Internal Server Error: ${error.message}\n\nStack: ${error.stack}`, { status: 500 });
  }
}
