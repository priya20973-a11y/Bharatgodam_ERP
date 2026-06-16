import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export async function GET() {
  try {
    const session = await requireSession();
    const userId = session.user.id;

    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    const { password, ...userData } = user;

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        fullName: user.fullName || '',
        email: user.email || '',
        role: user.role || '',
        companyName: user.companyName || '',
        phoneNumber: user.phoneNumber || '',
        warehouseLocation: user.warehouseLocation || '',
        gstNumber: user.gstNumber || null,
        bankName: user.bankName || null,
        bankAccountNumber: user.bankAccountNumber || null,
        ifscCode: user.ifscCode || null,
        bankBranch: user.bankBranch || null,
        companyLogo: user.companyLogo || null,
      },
    });
  } catch (error: any) {
    console.error('Profile GET error:', error);
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await requireSession();
    const userId = session.user.id;
    const body = await req.json();
    const { fullName, companyName, phoneNumber, address, warehouseLocation, gstNumber, bankName, bankAccountNumber, ifscCode, bankBranch, companyLogo } = body;

    const updates: Record<string, unknown> = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (companyName !== undefined) updates.companyName = companyName;
    if (phoneNumber !== undefined) {
      const phoneRegex = /^[0-9]{10}$/;
      const trimmedPhone = phoneNumber.toString().trim();
      if (trimmedPhone && !phoneRegex.test(trimmedPhone)) {
        return NextResponse.json(
          { message: 'Phone number must be exactly 10 digits.' },
          { status: 400 }
        );
      }
      updates.phoneNumber = phoneNumber;
    }
    if (address !== undefined) updates.address = address || null;
    if (warehouseLocation !== undefined) updates.warehouseLocation = warehouseLocation;
    if (gstNumber !== undefined) updates.gstNumber = gstNumber || null;
    if (bankName !== undefined) updates.bankName = bankName || null;
    if (bankAccountNumber !== undefined) updates.bankAccountNumber = bankAccountNumber || null;
    if (ifscCode !== undefined) updates.ifscCode = ifscCode || null;
    if (bankBranch !== undefined) updates.bankBranch = bankBranch || null;
    if (companyLogo !== undefined) updates.companyLogo = companyLogo || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: 'No profile fields provided to update.' },
        { status: 400 }
      );
    }

    updates.updatedAt = new Date();

    const db = await getDb();
    const updateResult = await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: updates }
    );

    if (updateResult.matchedCount === 0) {
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    const { password, ...userData } = user;

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        fullName: user.fullName || '',
        email: user.email || '',
        role: user.role || '',
        companyName: user.companyName || '',
        phoneNumber: user.phoneNumber || '',
        warehouseLocation: user.warehouseLocation || '',
        gstNumber: user.gstNumber || null,
        bankName: user.bankName || null,
        bankAccountNumber: user.bankAccountNumber || null,
        ifscCode: user.ifscCode || null,
        bankBranch: user.bankBranch || null,
        companyLogo: user.companyLogo || null,
      },
    });
  } catch (error: any) {
    console.error('Profile PATCH error:', error);
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
