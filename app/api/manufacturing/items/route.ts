import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToDatabase from '@/lib/mongoose';
import ManufacturingItem from '@/lib/models/ManufacturingItem';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();
    const items = await ManufacturingItem.find({ userEmail: session.user.email }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ items });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to load items' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    await connectToDatabase();

    const item = await ManufacturingItem.create({
      ...body,
      userId: (session.user as any).id,
      userEmail: session.user.email,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to create item' }, { status: 500 });
  }
}
