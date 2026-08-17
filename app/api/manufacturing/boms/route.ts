import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToDatabase from '@/lib/mongoose';
import ManufacturingBOM from '@/lib/models/ManufacturingBOM';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();
    const boms = await ManufacturingBOM.find({ userEmail: session.user.email }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ boms });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to load BOMs' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    await connectToDatabase();

    const bom = await ManufacturingBOM.create({
      ...body,
      userId: (session.user as any).id,
      userEmail: session.user.email,
    });

    return NextResponse.json({ bom }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to create BOM' }, { status: 500 });
  }
}
