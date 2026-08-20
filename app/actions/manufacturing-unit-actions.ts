'use server';

import { revalidatePath } from 'next/cache';
import connectToDatabase from '@/lib/mongoose';
import ManufacturingUnit from '@/lib/models/ManufacturingUnit';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';

function normalizeText(value?: string) {
  return value?.trim() || '';
}

export async function getManufacturingUnits() {
  await connectToDatabase();
  const session = await requireSession();
  const units = await ManufacturingUnit.find({ ...getTenantFilter(session) }).sort({ name: 1 }).lean();
  return JSON.parse(JSON.stringify(units));
}

export async function createManufacturingUnit(data: {
  name: string;
  code?: string;
  unitType?: 'PLANT' | 'UNIT' | 'LINE';
  address: string;
  state?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}) {
  await connectToDatabase();
  const session = await requireSession();

  const name = normalizeText(data.name);
  const code = normalizeText(data.code || name).slice(0, 30).toUpperCase();
  const address = normalizeText(data.address);

  if (!name || !address) {
    return { success: false, error: 'Name and address are required.' };
  }

  if (!code) {
    return { success: false, error: 'Unit code is required.' };
  }

  const existing = await ManufacturingUnit.findOne({
    ...getTenantFilter(session),
    $or: [{ code }, { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }],
  });

  if (existing) {
    return { success: false, error: 'Manufacturing unit name or code already exists for this account.' };
  }

  const unit = await ManufacturingUnit.create(
    appendOwnership(
      {
        name,
        code,
        unitType: data.unitType || 'UNIT',
        address,
        state: data.state || '',
        status: data.status || 'ACTIVE',
      },
      session
    )
  );

  revalidatePath('/manufacturing/units');
  return { success: true, data: JSON.parse(JSON.stringify(unit)) };
}

export async function updateManufacturingUnit(
  id: string,
  data: Partial<{
    name: string;
    code: string;
    unitType: 'PLANT' | 'UNIT' | 'LINE';
    address: string;
    state: string;
    status: 'ACTIVE' | 'INACTIVE';
  }>
) {
  await connectToDatabase();
  const session = await requireSession();

  const unit = await ManufacturingUnit.findOne({ _id: id, ...getTenantFilter(session) });
  if (!unit) {
    return { success: false, error: 'Manufacturing unit not found.' };
  }

  const payload: any = { ...data };
  if (payload.name) payload.name = normalizeText(payload.name);
  if (payload.code) payload.code = normalizeText(payload.code).toUpperCase();
  if (payload.address) payload.address = normalizeText(payload.address);

  if (payload.name && payload.name.length < 2) {
    return { success: false, error: 'Unit name must have at least 2 characters.' };
  }

  if (payload.code && payload.code.length < 2) {
    return { success: false, error: 'Unit code must have at least 2 characters.' };
  }

  if (payload.name || payload.code) {
    const existing = await ManufacturingUnit.findOne({
      _id: { $ne: id },
      ...getTenantFilter(session),
      $or: [
        ...(payload.code ? [{ code: payload.code }] : []),
        ...(payload.name ? [{ name: { $regex: new RegExp(`^${payload.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }] : []),
      ],
    });

    if (existing) {
      return { success: false, error: 'Manufacturing unit name or code already exists for this account.' };
    }
  }

  const updated = await ManufacturingUnit.findOneAndUpdate({ _id: id, ...getTenantFilter(session) }, payload, {
    new: true,
  });

  revalidatePath('/manufacturing/units');
  return { success: true, data: JSON.parse(JSON.stringify(updated)) };
}

export async function deleteManufacturingUnit(id: string) {
  await connectToDatabase();
  const session = await requireSession();

  const deleted = await ManufacturingUnit.findOneAndDelete({ _id: id, ...getTenantFilter(session) });
  if (!deleted) {
    return { success: false, error: 'Manufacturing unit not found.' };
  }

  revalidatePath('/manufacturing/units');
  return { success: true };
}
