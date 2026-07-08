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

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        fullName: user.fullName || '',
        email: user.email || '',
        role: user.role || '',
        companyName: user.companyName || '',
        phoneNumber: user.phoneNumber || '',
        address: user.address || null,
        warehouseLocation: user.warehouseLocation || '',
        state: user.state || '',
        gstNumber: user.gstNumber || null,
        bankName: user.bankName || null,
        accountName: user.accountName || null,
        bankAccountNumber: user.bankAccountNumber || null,
        ifscCode: user.ifscCode || null,
        bankBranch: user.bankBranch || null,
        companyLogo: user.companyLogo || null,
        panNumber: user.panNumber || null,
        termsAndConditions: user.termsAndConditions || null,
        isNewRegistration: !!user.isNewRegistration,
        coldLanguage: user.coldLanguage || 'en',
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
    const {
      fullName,
      companyName,
      phoneNumber,
      address,
      warehouseLocation,
      state,
      gstNumber,
      bankName,
      accountName,
      bankAccountNumber,
      ifscCode,
      bankBranch,
      companyLogo,
      panNumber,
      termsAndConditions,
      coldLanguage
    } = body;

    const db = await getDb();
    const userBeforeUpdate = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!userBeforeUpdate) {
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    const isNew = !!userBeforeUpdate.isNewRegistration;

    const merged = {
      state: state !== undefined ? state : userBeforeUpdate.state,
      bankName: bankName !== undefined ? bankName : userBeforeUpdate.bankName,
      accountName: accountName !== undefined ? accountName : userBeforeUpdate.accountName,
      bankAccountNumber: bankAccountNumber !== undefined ? bankAccountNumber : userBeforeUpdate.bankAccountNumber,
      ifscCode: ifscCode !== undefined ? ifscCode : userBeforeUpdate.ifscCode,
      bankBranch: bankBranch !== undefined ? bankBranch : userBeforeUpdate.bankBranch,
      companyLogo: companyLogo !== undefined ? companyLogo : userBeforeUpdate.companyLogo,
      gstNumber: gstNumber !== undefined ? gstNumber : userBeforeUpdate.gstNumber,
      panNumber: panNumber !== undefined ? panNumber : userBeforeUpdate.panNumber,
      termsAndConditions: termsAndConditions !== undefined ? termsAndConditions : userBeforeUpdate.termsAndConditions,
    };

    const trimmedGst = merged.gstNumber ? merged.gstNumber.toString().trim().toUpperCase() : '';
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    const trimmedPan = merged.panNumber ? merged.panNumber.toString().trim().toUpperCase() : '';
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

    const isProfileUpdate = Object.keys(body).some(key => key !== 'coldLanguage');

    if (isProfileUpdate) {
      if (isNew) {
        if (!merged.state || !merged.state.toString().trim()) {
          return NextResponse.json({ message: 'State is required.' }, { status: 400 });
        }
        if (!merged.bankName || !merged.bankName.toString().trim() ||
            !merged.accountName || !merged.accountName.toString().trim() ||
            !merged.bankAccountNumber || !merged.bankAccountNumber.toString().trim() ||
            !merged.ifscCode || !merged.ifscCode.toString().trim() ||
            !merged.bankBranch || !merged.bankBranch.toString().trim()) {
          return NextResponse.json({ message: 'All bank details are required.' }, { status: 400 });
        }
        if (!merged.companyLogo) {
          return NextResponse.json({ message: 'Company logo is required.' }, { status: 400 });
        }
        if (!trimmedGst) {
          return NextResponse.json({ message: 'GST Number is required (use NA if not applicable).' }, { status: 400 });
        }
        if (trimmedGst !== 'NA' && !gstRegex.test(trimmedGst)) {
          return NextResponse.json({ message: 'Please enter a valid GSTIN format or NA.' }, { status: 400 });
        }
        if (!trimmedPan) {
          return NextResponse.json({ message: 'PAN Number is required.' }, { status: 400 });
        }
        if (!panRegex.test(trimmedPan)) {
          return NextResponse.json({ message: 'Please enter a valid PAN format (AAAAA9999A).' }, { status: 400 });
        }
      } else {
        if (gstNumber !== undefined && trimmedGst && trimmedGst !== 'NA' && !gstRegex.test(trimmedGst)) {
          return NextResponse.json({ message: 'Please enter a valid GSTIN format or NA.' }, { status: 400 });
        }
        if (panNumber !== undefined && trimmedPan && !panRegex.test(trimmedPan)) {
          return NextResponse.json({ message: 'Please enter a valid PAN format (AAAAA9999A).' }, { status: 400 });
        }
      }
    }

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
    if (state !== undefined) updates.state = state || '';
    if (gstNumber !== undefined) updates.gstNumber = trimmedGst || null;
    if (bankName !== undefined) updates.bankName = bankName || null;
    if (accountName !== undefined) updates.accountName = accountName || null;
    if (bankAccountNumber !== undefined) updates.bankAccountNumber = bankAccountNumber || null;
    if (ifscCode !== undefined) updates.ifscCode = ifscCode || null;
    if (bankBranch !== undefined) updates.bankBranch = bankBranch || null;
    if (companyLogo !== undefined) updates.companyLogo = companyLogo || null;
    if (panNumber !== undefined) updates.panNumber = trimmedPan || null;
    if (termsAndConditions !== undefined) updates.termsAndConditions = termsAndConditions || null;
    if (coldLanguage !== undefined) updates.coldLanguage = coldLanguage;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: 'No profile fields provided to update.' },
        { status: 400 }
      );
    }

    updates.updatedAt = new Date();

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

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        fullName: user.fullName || '',
        email: user.email || '',
        role: user.role || '',
        companyName: user.companyName || '',
        phoneNumber: user.phoneNumber || '',
        address: user.address || null,
        warehouseLocation: user.warehouseLocation || '',
        state: user.state || '',
        gstNumber: user.gstNumber || null,
        bankName: user.bankName || null,
        accountName: user.accountName || null,
        bankAccountNumber: user.bankAccountNumber || null,
        ifscCode: user.ifscCode || null,
        bankBranch: user.bankBranch || null,
        companyLogo: user.companyLogo || null,
        panNumber: user.panNumber || null,
        termsAndConditions: user.termsAndConditions || null,
        isNewRegistration: !!user.isNewRegistration,
        coldLanguage: user.coldLanguage || 'en',
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
