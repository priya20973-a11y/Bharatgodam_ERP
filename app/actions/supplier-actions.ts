'use server';

import { revalidatePath } from 'next/cache';
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

export async function getSuppliers() {
  await connectToDatabase();
  const session = await requireSession();
  const suppliers = await Supplier.find({ ...getTenantFilter(session) }).sort({ supplierName: 1 }).lean();
  return JSON.parse(JSON.stringify(suppliers));
}

export async function createSupplier(data: {
  supplierId?: string;
  supplierName: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  alternateMobile?: string;
  email?: string;
  alternateEmail?: string;
  gstin?: string;
  pan?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  country?: string;
  paymentTerms?: string;
  creditPeriod?: number;
  openingBalance?: number;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  remarks?: string;
}) {
  await connectToDatabase();
  const session = await requireSession();

  const supplierName = normalize(data.supplierName);
  const companyName = normalize(data.companyName);
  const contactPerson = normalize(data.contactPerson);
  const mobile = normalize(data.mobile);

  if (!supplierName || !companyName || !contactPerson || !mobile) {
    return { success: false, error: 'Supplier name, company, contact person, and mobile are required.' };
  }

  const supplierId = normalize(data.supplierId) || generateSupplierId();

  const duplicate = await Supplier.findOne({
    ...getTenantFilter(session),
    $or: [{ supplierId }, { supplierName: { $regex: new RegExp(`^${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }],
  });

  if (duplicate) {
    return { success: false, error: 'Supplier ID or supplier name already exists for this account.' };
  }

  const supplier = await Supplier.create(
    appendOwnership(
      {
        supplierId,
        supplierName,
        companyName,
        contactPerson,
        mobile,
        alternateMobile: normalize(data.alternateMobile),
        email: normalize(data.email),
        alternateEmail: normalize(data.alternateEmail),
        gstin: normalize(data.gstin),
        pan: normalize(data.pan),
        address: normalize(data.address),
        city: normalize(data.city),
        state: normalize(data.state),
        pinCode: normalize(data.pinCode),
        country: normalize(data.country) || 'India',
        paymentTerms: normalize(data.paymentTerms),
        creditPeriod: Number(data.creditPeriod || 0),
        openingBalance: Number(data.openingBalance || 0),
        bankName: normalize(data.bankName),
        accountNumber: normalize(data.accountNumber),
        ifsc: normalize(data.ifsc),
        status: data.status || 'ACTIVE',
        remarks: normalize(data.remarks),
      },
      session
    )
  );

  revalidatePath('/manufacturing/procurement');
  return { success: true, data: JSON.parse(JSON.stringify(supplier)) };
}

export async function updateSupplier(id: string, data: Partial<{
  supplierId: string;
  supplierName: string;
  companyName: string;
  contactPerson: string;
  mobile: string;
  alternateMobile: string;
  email: string;
  alternateEmail: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
  paymentTerms: string;
  creditPeriod: number;
  openingBalance: number;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  status: 'ACTIVE' | 'INACTIVE';
  remarks: string;
}>) {
  await connectToDatabase();
  const session = await requireSession();

  const supplier = await Supplier.findOne({ _id: id, ...getTenantFilter(session) });
  if (!supplier) {
    return { success: false, error: 'Supplier not found.' };
  }

  const payload: any = { ...data };
  if (payload.supplierId) payload.supplierId = normalize(payload.supplierId).toUpperCase();
  if (payload.supplierName) payload.supplierName = normalize(payload.supplierName);
  if (payload.companyName) payload.companyName = normalize(payload.companyName);
  if (payload.contactPerson) payload.contactPerson = normalize(payload.contactPerson);
  if (payload.mobile) payload.mobile = normalize(payload.mobile);
  if (payload.address) payload.address = normalize(payload.address);
  if (payload.city) payload.city = normalize(payload.city);
  if (payload.state) payload.state = normalize(payload.state);
  if (payload.pinCode) payload.pinCode = normalize(payload.pinCode);
  if (payload.country) payload.country = normalize(payload.country);
  if (payload.paymentTerms) payload.paymentTerms = normalize(payload.paymentTerms);
  if (payload.bankName) payload.bankName = normalize(payload.bankName);
  if (payload.accountNumber) payload.accountNumber = normalize(payload.accountNumber);
  if (payload.ifsc) payload.ifsc = normalize(payload.ifsc);
  if (payload.remarks) payload.remarks = normalize(payload.remarks);

  if (payload.supplierId || payload.supplierName) {
    const duplicate = await Supplier.findOne({
      _id: { $ne: id },
      ...getTenantFilter(session),
      $or: [
        ...(payload.supplierId ? [{ supplierId: payload.supplierId }] : []),
        ...(payload.supplierName ? [{ supplierName: { $regex: new RegExp(`^${payload.supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }] : []),
      ],
    });

    if (duplicate) {
      return { success: false, error: 'Supplier ID or supplier name already exists for this account.' };
    }
  }

  const updated = await Supplier.findOneAndUpdate({ _id: id, ...getTenantFilter(session) }, payload, { new: true });

  revalidatePath('/manufacturing/procurement');
  return { success: true, data: JSON.parse(JSON.stringify(updated)) };
}

export async function deleteSupplier(id: string) {
  await connectToDatabase();
  const session = await requireSession();

  const deleted = await Supplier.findOneAndDelete({ _id: id, ...getTenantFilter(session) });
  if (!deleted) {
    return { success: false, error: 'Supplier not found.' };
  }

  revalidatePath('/manufacturing/procurement');
  return { success: true };
}
