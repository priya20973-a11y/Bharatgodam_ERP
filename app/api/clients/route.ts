import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { appendOwnershipForMongo, getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

const mobileRegex = /^[0-9]{10}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i;
const aadhaarRegex = /^[0-9]{12}$/;

const isNAValue = (value: string) => value.trim().toUpperCase() === 'NA';
const normalizeAadhaarValue = (value: string) => value.replace(/\s+/g, '');
const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || null;

function validateClientPayload(payload: {
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
}) {
  const mobile = payload.mobile.trim();
  if (!mobile) return 'Mobile number is required';
  if (!isNAValue(mobile) && !mobileRegex.test(mobile)) return 'Mobile number must be 10 digits or NA';

  const pan = payload.panNumber.trim();
  if (!pan) return 'PAN number is required';
  if (!isNAValue(pan) && !panRegex.test(pan)) return 'PAN number must be valid or NA';

  const aadhar = payload.aadharNumber.trim();
  if (!aadhar) return 'Aadhaar number is required';
  if (!isNAValue(aadhar) && !aadhaarRegex.test(normalizeAadhaarValue(aadhar))) return 'Aadhaar number must be 12 digits or NA';

  const gst = payload.gstNumber.trim();
  if (!gst) return 'GSTIN is required';
  if (!isNAValue(gst) && !gstRegex.test(gst)) return 'GSTIN must be valid or NA';

  return null;
}

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
      ? (await db.collection('transactions').aggregate([
          {
            $match: {
              warehouseId: { $in: warehouseQueryIds },
              ...tenantFilter,
            }
          },
          {
            $group: {
              _id: '$clientId'
            }
          }
        ]).toArray()).map((doc: any) => doc._id)
      : [];

    const clientDocs = await db.collection('clients')
      .find({ ...tenantFilter, _id: { $in: clientIds } })
      .sort({ name: 1 })
      .toArray();

    if (clientDocs.length > 0) {
      const userIds = clientDocs.map((c: any) => c.userId).filter((id: any): id is any => !!id);
      const uniqueUserIds = Array.from(new Set(userIds.map((id: any) => id.toString()))).map((id: any) => {
        try { return new ObjectId(id); } catch { return id; }
      });
      const users = uniqueUserIds.length > 0
        ? await db.collection('users').find({ _id: { $in: uniqueUserIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray()
        : [];
      const userMap = new Map(users.map((u: any) => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

      const clients = clientDocs.map((client: any) => {
        const userId = client.userId?.toString();
        const userInfo = userId ? userMap.get(userId) : null;
        const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (client.userId ? 'Unknown' : 'System');
        return {
          id: client._id?.toString() || '',
          _id: client._id?.toString() || '',
          name: client.name || client.clientName || 'Unknown',
          type: client.clientType || client.type || 'FARMER',
          address: client.address || client.clientLocation || '',
          mobile: client.mobile || client.contactInfo?.mobile || client.contactInfo?.phone || '',
          panNumber: client.panNumber || client.panCard || '',
          aadharNumber: client.aadharNumber || client.adhaarNumber || '',
          gstNumber: client.gstNumber || client.gst || client.gstin || '',
          commodityIds: Array.isArray(client.commodityIds) ? client.commodityIds.map((id: any) => id?.toString?.() || id) : [],
          wspName
        };
      });

      return NextResponse.json({
        success: true,
        clients
      });
    }

    const accountDocs = await db.collection('client_accounts').find({ ...tenantFilter }).sort({ clientName: 1 }).toArray();
    
    const userIds = accountDocs.map((c: any) => c.userId).filter((id: any): id is any => !!id);
    const uniqueUserIds = Array.from(new Set(userIds.map((id: any) => id.toString()))).map((id: any) => {
      try { return new ObjectId(id); } catch { return id; }
    });
    const users = uniqueUserIds.length > 0
      ? await db.collection('users').find({ _id: { $in: uniqueUserIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray()
      : [];
    const userMap = new Map(users.map((u: any) => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

    const clients = accountDocs.map((client: any) => {
      const userId = client.userId?.toString();
      const userInfo = userId ? userMap.get(userId) : null;
      const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (client.userId ? 'Unknown' : 'System');
      return {
        id: client._id?.toString() || `legacy-${Date.now()}`,
        _id: client._id?.toString() || `legacy-${Date.now()}`,
        name: client.clientName || client.name || 'Unknown',
        type: client.clientType || 'FARMER',
        address: client.clientLocation || client.address || '',
        mobile: client.contactInfo?.mobile || client.contactInfo?.phone || '',
        wspName
      };
    });

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
    const { name, type, address, mobile, panNumber, aadharNumber, gstNumber, otherDetails, commodityIds } = body;

    if (!name || !type || !address || !mobile || !panNumber || !aadharNumber || !gstNumber) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: name, type, address, mobile, panNumber, aadharNumber, gstNumber'
      }, { status: 400 });
    }

    const payloadError = validateClientPayload({ mobile, panNumber, aadharNumber, gstNumber });
    if (payloadError) {
      return NextResponse.json({ success: false, message: payloadError }, { status: 400 });
    }

    const db = await getDb();
    const email = normalizeEmail(session.user.email);
    let userIdFilter: any = String(session.user.id);
    try {
      userIdFilter = new ObjectId(String(session.user.id));
    } catch {
      // preserve string id for legacy / non-ObjectId stores
    }

    const ownerFilter: any = {
      $or: [
        { userId: userIdFilter },
        ...(email
          ? [{ $and: [
              { $or: [{ userId: { $exists: false } }, { userId: null }] },
              { userEmail: { $regex: new RegExp(`^${escapeRegExp(email)}$`, 'i') } }
            ] }]
          : [])
      ]
    };
    const nameValue = String(name).trim();
    const normalizedName = nameValue.toUpperCase();

    const existingClient = await db.collection('clients').findOne({
      $and: [
        ownerFilter,
        {
          $or: [
            { nameKey: normalizedName },
            { name: { $regex: new RegExp(`^${escapeRegExp(nameValue)}$`, 'i') } }
          ]
        }
      ]
    });

    if (existingClient) {
      return NextResponse.json(
        { success: false, message: 'Client name already exists for your account' },
        { status: 400 }
      );
    }

    const client = appendOwnershipForMongo({
      name: nameValue,
      nameKey: normalizedName,
      type,
      address,
      mobile,
      panNumber,
      aadharNumber,
      gstNumber,
      otherDetails: otherDetails || '',
      commodityIds: Array.isArray(commodityIds) ? commodityIds : [],
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