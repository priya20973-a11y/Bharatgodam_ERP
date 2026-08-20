import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import Supplier from '@/lib/models/Supplier';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';

function normalize(value?: string) {
  return value?.trim() || '';
}

function generateSupplierId() {
  const prefix = 'SUP';
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}${stamp}${random}`;
}

export async function GET() {
  try {
    const session = await requireSession();
    await connectToDatabase();
    const suppliers = await Supplier.find({ ...getTenantFilter(session) }).sort({ supplierName: 1 }).lean();
    return NextResponse.json({ suppliers });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to load suppliers.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const supplierName = normalize(body.supplierName);
    const companyName = normalize(body.companyName);
    const contactPerson = normalize(body.contactPerson);
    const mobile = normalize(body.mobile);

    if (!supplierName || !companyName || !contactPerson || !mobile) {
      return NextResponse.json({ message: 'Supplier name, company, contact person, and mobile are required.' }, { status: 400 });
    }

    await connectToDatabase();
    const supplierId = normalize(body.supplierId) || generateSupplierId();

    const existing = await Supplier.findOne({
      ...getTenantFilter(session),
      $or: [{ supplierId }, { supplierName: { $regex: new RegExp(`^${supplierName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }],
    });

    if (existing) {
      return NextResponse.json({ message: 'Supplier ID or supplier name already exists for this account.' }, { status: 409 });
    }

    const supplier = await Supplier.create(
      appendOwnership(
        {
          supplierId,
          supplierName,
          companyName,
          contactPerson,
          mobile,
          alternateMobile: normalize(body.alternateMobile),
          email: normalize(body.email),
          alternateEmail: normalize(body.alternateEmail),
          gstin: normalize(body.gstin),
          pan: normalize(body.pan),
          address: normalize(body.address),
          city: normalize(body.city),
          state: normalize(body.state),
          pinCode: normalize(body.pinCode),
          country: normalize(body.country) || 'India',
          paymentTerms: normalize(body.paymentTerms),
          creditPeriod: Number(body.creditPeriod || 0),
          openingBalance: Number(body.openingBalance || 0),
          bankName: normalize(body.bankName),
          accountNumber: normalize(body.accountNumber),
          ifsc: normalize(body.ifsc),
          status: body.status || 'ACTIVE',
          remarks: normalize(body.remarks),
        },
        session
      )
    );

    return NextResponse.json({ supplier }, { status: 201 });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to create supplier.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ message: 'Supplier id is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const supplier = await Supplier.findOne({ _id: id, ...getTenantFilter(session) });
    if (!supplier) {
      return NextResponse.json({ message: 'Supplier not found.' }, { status: 404 });
    }

    const nextSupplierId = updates.supplierId ? normalize(updates.supplierId).toUpperCase() : supplier.supplierId;
    const nextSupplierName = updates.supplierName ? normalize(updates.supplierName) : supplier.supplierName;

    const duplicate = await Supplier.findOne({
      _id: { $ne: id },
      ...getTenantFilter(session),
      $or: [
        ...(nextSupplierId ? [{ supplierId: nextSupplierId }] : []),
        ...(nextSupplierName ? [{ supplierName: { $regex: new RegExp(`^${nextSupplierName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }] : []),
      ],
    });

    if (duplicate) {
      return NextResponse.json({ message: 'Supplier ID or supplier name already exists for this account.' }, { status: 409 });
    }

    Object.assign(supplier, {
      ...updates,
      supplierId: nextSupplierId,
      supplierName: nextSupplierName,
      companyName: updates.companyName ? normalize(updates.companyName) : supplier.companyName,
      contactPerson: updates.contactPerson ? normalize(updates.contactPerson) : supplier.contactPerson,
      mobile: updates.mobile ? normalize(updates.mobile) : supplier.mobile,
      alternateMobile: updates.alternateMobile !== undefined ? normalize(updates.alternateMobile) : supplier.alternateMobile,
      email: updates.email !== undefined ? normalize(updates.email) : supplier.email,
      alternateEmail: updates.alternateEmail !== undefined ? normalize(updates.alternateEmail) : supplier.alternateEmail,
      gstin: updates.gstin !== undefined ? normalize(updates.gstin) : supplier.gstin,
      pan: updates.pan !== undefined ? normalize(updates.pan) : supplier.pan,
      address: updates.address !== undefined ? normalize(updates.address) : supplier.address,
      city: updates.city !== undefined ? normalize(updates.city) : supplier.city,
      state: updates.state !== undefined ? normalize(updates.state) : supplier.state,
      pinCode: updates.pinCode !== undefined ? normalize(updates.pinCode) : supplier.pinCode,
      country: updates.country !== undefined ? normalize(updates.country) : supplier.country,
      paymentTerms: updates.paymentTerms !== undefined ? normalize(updates.paymentTerms) : supplier.paymentTerms,
      creditPeriod: updates.creditPeriod !== undefined ? Number(updates.creditPeriod || 0) : supplier.creditPeriod,
      openingBalance: updates.openingBalance !== undefined ? Number(updates.openingBalance || 0) : supplier.openingBalance,
      bankName: updates.bankName !== undefined ? normalize(updates.bankName) : supplier.bankName,
      accountNumber: updates.accountNumber !== undefined ? normalize(updates.accountNumber) : supplier.accountNumber,
      ifsc: updates.ifsc !== undefined ? normalize(updates.ifsc) : supplier.ifsc,
      status: updates.status || supplier.status,
      remarks: updates.remarks !== undefined ? normalize(updates.remarks) : supplier.remarks,
    });

    await supplier.save();
    return NextResponse.json({ supplier });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to update supplier.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Supplier id is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const deleted = await Supplier.findOneAndDelete({ _id: id, ...getTenantFilter(session) });

    if (!deleted) {
      return NextResponse.json({ message: 'Supplier not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to delete supplier.' }, { status: 500 });
  }
}
