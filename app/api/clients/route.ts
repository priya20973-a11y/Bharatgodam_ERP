import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { appendOwnershipForMongo, getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

    const warehouseDocs = await db.collection('warehouses')
      .find({ ...tenantFilter })
      .project({ _id: 1 })
      .toArray();
    const ownedWarehouseIdStrings = warehouseDocs.map((warehouse: any) => warehouse._id.toString());
    const ownedWarehouseObjectIds = warehouseDocs
      .map((warehouse: any) => warehouse._id)
      .filter((id: any) => id instanceof ObjectId);
    const warehouseQueryIds = [...ownedWarehouseIdStrings, ...ownedWarehouseObjectIds];

    const clientIds = warehouseQueryIds.length > 0
      ? await db.collection('transactions').distinct('clientId', {
          warehouseId: { $in: warehouseQueryIds },
          ...tenantFilter,
        })
      : [];

    const clientDocs = await db.collection('clients')
      .find({ ...tenantFilter, _id: { $in: clientIds } })
      .sort({ name: 1 })
      .toArray();

    if (clientDocs.length > 0) {
      const clients = clientDocs.map((client: any) => ({
        id: client._id?.toString() || '',
        name: client.name || client.clientName || 'Unknown',
        type: client.clientType || client.type || 'FARMER',
        address: client.address || client.clientLocation || '',
        mobile: client.mobile || client.contactInfo?.mobile || client.contactInfo?.phone || '',
        panNumber: client.panNumber || client.panCard || '',
        aadharNumber: client.aadharNumber || client.adhaarNumber || '',
        gstNumber: client.gstNumber || client.gst || client.gstin || '',
      }));

      return NextResponse.json({
        success: true,
        clients
      });
    }

    const accountDocs = await db.collection('client_accounts').find({ ...tenantFilter }).sort({ clientName: 1 }).toArray();
    const clients = accountDocs.map((client: any) => ({
      id: client._id?.toString() || `legacy-${Date.now()}`,
      name: client.clientName || client.name || 'Unknown',
      type: client.clientType || 'FARMER',
      address: client.clientLocation || client.address || '',
      mobile: client.contactInfo?.mobile || client.contactInfo?.phone || '',
    }));

    return NextResponse.json({
      success: true,
      clients
    });

  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch clients' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type, address, mobile, panNumber, aadharNumber, gstNumber, otherDetails } = body;

    if (!name || !type || !address || !mobile || !panNumber || !aadharNumber || !gstNumber) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: name, type, address, mobile, panNumber, aadharNumber, gstNumber'
      }, { status: 400 });
    }

    const db = await getDb();

    const client = appendOwnershipForMongo({
      name,
      type,
      address,
      mobile,
      panNumber,
      aadharNumber,
      gstNumber,
      otherDetails: otherDetails || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, session);

    const result = await db.collection('clients').insertOne(client);

    return NextResponse.json({
      success: true,
      message: 'Client created successfully',
      client: {
        id: result.insertedId.toString(),
        ...client
      }
    });

  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create client' },
      { status: 500 }
    );
  }
}