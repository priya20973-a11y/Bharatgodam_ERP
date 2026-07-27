import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getStackDetails } from '@/app/actions/floor-mapping-actions';
import { generateColdStackReceiptHTML } from '@/lib/invoice/cold-stack-receipt';
import ColdWarehouse from '@/lib/models/ColdWarehouse';

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();
    
    const warehouseId = request.nextUrl.searchParams.get('warehouseId');
    const chamberNo = request.nextUrl.searchParams.get('chamberNo');
    const floorNo = request.nextUrl.searchParams.get('floorNo');
    const stackNo = request.nextUrl.searchParams.get('stackNo');
    
    if (!warehouseId || !chamberNo || !floorNo || !stackNo) {
      return new NextResponse('Invalid parameters', { status: 400 });
    }
    
    const result = await getStackDetails(warehouseId, chamberNo, parseInt(floorNo), parseInt(stackNo));
    
    if (!result.success || !result.data) {
      return new NextResponse(result.error || 'Stack not found', { status: 404 });
    }

    const data = result.data;
    data.chamberNo = chamberNo;
    data.floorNo = floorNo;
    
    const warehouse = await ColdWarehouse.findById(warehouseId).lean();
    const warehouseName = warehouse?.name || 'Cold Storage';
    const warehouseAddress = warehouse?.address || '';

    const db = await getDb();
    
    const isStaff = (session.user as any).isStaff;
    const userId = isStaff ? (session.user as any).staffId : session.user.id;
    
    const dbUser = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    
    const userDetails = {
      companyLogo: warehouse?.logoUrl || dbUser?.companyLogo || '',
      phoneNumber: dbUser?.phoneNumber || (session.user as any).phoneNumber || '',
    };
    
    const html = generateColdStackReceiptHTML(data, warehouseName, warehouseAddress, userDetails);
    
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });
  } catch (error: any) {
    console.error('Error generating cold stack receipt:', error);
    return new NextResponse(error.message || 'Internal Server Error', { status: 500 });
  }
}
