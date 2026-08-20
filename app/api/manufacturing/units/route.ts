import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ManufacturingUnit from '@/lib/models/ManufacturingUnit';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';

function normalizeText(value?: string) {
  return value?.trim() || '';
}

export async function GET() {
  try {
    const session = await requireSession();
    await connectToDatabase();
    const units = await ManufacturingUnit.find({ ...getTenantFilter(session) }).sort({ name: 1 }).lean();
    return NextResponse.json({ units });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to load manufacturing units.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const name = normalizeText(body.name);
    const code = normalizeText(body.code || name).toUpperCase();
    const address = normalizeText(body.address);

    if (!name || !address || !code) {
      return NextResponse.json({ message: 'Name, code, and address are required.' }, { status: 400 });
    }

    await connectToDatabase();

    const existing = await ManufacturingUnit.findOne({
      ...getTenantFilter(session),
      $or: [{ code }, { name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }],
    });

    if (existing) {
      return NextResponse.json({ message: 'Manufacturing unit name or code already exists for this account.' }, { status: 409 });
    }

    const unit = await ManufacturingUnit.create(
      appendOwnership(
        {
          name,
          code,
          unitType: body.unitType || 'UNIT',
          address,
          state: body.state || '',
          status: body.status || 'ACTIVE',
        },
        session
      )
    );

    return NextResponse.json({ unit }, { status: 201 });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to create manufacturing unit.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ message: 'Manufacturing unit id is required.' }, { status: 400 });
    }

    await connectToDatabase();

    const unit = await ManufacturingUnit.findOne({ _id: id, ...getTenantFilter(session) });
    if (!unit) {
      return NextResponse.json({ message: 'Manufacturing unit not found.' }, { status: 404 });
    }

    const nextName = updates.name ? normalizeText(updates.name) : unit.name;
    const nextCode = updates.code ? normalizeText(updates.code).toUpperCase() : unit.code;
    if (nextName && nextCode && nextName && nextCode) {
      const duplicate = await ManufacturingUnit.findOne({
        _id: { $ne: id },
        ...getTenantFilter(session),
        $or: [{ code: nextCode }, { name: { $regex: new RegExp(`^${nextName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }],
      });
      if (duplicate) {
        return NextResponse.json({ message: 'Manufacturing unit name or code already exists for this account.' }, { status: 409 });
      }
    }

    Object.assign(unit, {
      ...updates,
      name: nextName,
      code: nextCode,
      address: updates.address ? normalizeText(updates.address) : unit.address,
      state: updates.state !== undefined ? normalizeText(updates.state) : unit.state,
      status: updates.status || unit.status,
      unitType: updates.unitType || unit.unitType,
    });

    await unit.save();
    return NextResponse.json({ unit });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to update manufacturing unit.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Manufacturing unit id is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const deleted = await ManufacturingUnit.findOneAndDelete({ _id: id, ...getTenantFilter(session) });

    if (!deleted) {
      return NextResponse.json({ message: 'Manufacturing unit not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to delete manufacturing unit.' }, { status: 500 });
  }
}
