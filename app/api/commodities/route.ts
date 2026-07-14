import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { appendOwnershipForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const db = await getDb();
    
    let commodities: any[] = [];
    
    if (session?.user?.id) {
      // Fetch user specific commodities
      let ownerId: ObjectId | string = session.user.id;
      try {
        ownerId = new ObjectId(String(session.user.id));
      } catch {
        ownerId = session.user.id;
      }
      
      commodities = await db.collection('commodities').find({ userId: ownerId }).toArray();
    }
    
    if (commodities.length === 0) {
      // Fallback to warehouse config if no user specific commodities
      const config = await db.collection('warehouse_config').findOne({});
      commodities = config?.commodities || [
        { id: 'comm1', name: 'Rice Paddy', rate: 10, rateUnit: 'day' },
        { id: 'comm2', name: 'Wheat', rate: 8, rateUnit: 'day' },
        { id: 'comm3', name: 'Corn', rate: 12, rateUnit: 'day' },
      ];
    } else {
      commodities = commodities.map(c => ({
        id: c._id.toString(),
        name: c.name,
        rate: c.ratePerMtPerDay || c.rate,
        rateUnit: c.rateUnit || 'day'
      }));
    }

    return NextResponse.json({
      success: true,
      commodities
    });

  } catch (error) {
    console.error('Error fetching commodities:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch commodities' },
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
    const { name, rate, rateUnit } = body;

    if (!name || !rate || !rateUnit) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: name, rate, rateUnit'
      }, { status: 400 });
    }

    const db = await getDb();
    const nameValue = String(name).trim();
    const normalizedName = nameValue.toUpperCase();
    const userId = session.user.id;
    let ownerId: ObjectId | string = userId;

    try {
      ownerId = new ObjectId(String(userId));
    } catch {
      ownerId = userId;
    }

    const existingCommodity = await db.collection('commodities').findOne({
      userId: ownerId,
      name: { $regex: new RegExp(`^${escapeRegExp(nameValue)}$`, 'i') },
    });

    if (existingCommodity) {
      return NextResponse.json(
        { success: false, message: 'Commodity name already exists for your account' },
        { status: 400 }
      );
    }

    const commodity = appendOwnershipForMongo(
      {
        name: normalizedName,
        rate: Number(rate),
        rateUnit,
        createdAt: new Date(),
      },
      session
    );

    const result = await db.collection('commodities').insertOne(commodity);

    return NextResponse.json({
      success: true,
      message: 'Commodity created successfully',
      commodity: {
        id: result.insertedId.toString(),
        ...commodity
      }
    });

  } catch (error) {
    console.error('Error creating commodity:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create commodity' },
      { status: 500 }
    );
  }
}