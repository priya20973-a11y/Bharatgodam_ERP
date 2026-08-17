import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import connectToDatabase from '@/lib/mongoose';
import ManufacturingTransaction from '@/lib/models/ManufacturingTransaction';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();
    const transactions = await ManufacturingTransaction.find({ userEmail: session.user.email }).sort({ transactionDate: -1 }).lean();
    return NextResponse.json({ transactions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to load transactions' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    await connectToDatabase();

    const transaction = await ManufacturingTransaction.create({
      ...body,
      userId: (session.user as any).id,
      userEmail: session.user.email,
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to create transaction' }, { status: 500 });
  }
}
