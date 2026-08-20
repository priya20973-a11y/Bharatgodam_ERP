import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ManufacturingItem from '@/lib/models/ManufacturingItem';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';

const ITEM_TYPES = ['RAW_MATERIAL', 'FINISHED_GOOD', 'WASTE'] as const;
const ITEM_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

function normalizeText(value?: string) {
  return value?.trim() ?? '';
}

function getNumeric(value: unknown, fallback = 0) {
  const num = Number(value ?? fallback);
  return Number.isFinite(num) ? num : fallback;
}

function buildCode(type: string) {
  const prefix = type === 'RAW_MATERIAL' ? 'RM' : type === 'FINISHED_GOOD' ? 'FG' : 'WST';
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const type = normalizeText(searchParams.get('type') ?? '').toUpperCase();

    await connectToDatabase();
    const query: any = { ...getTenantFilter(session) };

    if (type && ITEM_TYPES.includes(type as any)) {
      query.type = type;
    }

    const items = await ManufacturingItem.find(query).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ items });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to load items.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const type = normalizeText(body.type || body.itemType || 'RAW_MATERIAL').toUpperCase();
    const name = normalizeText(body.name);

    if (!ITEM_TYPES.includes(type as any)) {
      return NextResponse.json({ message: 'Invalid item type.' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ message: 'Item name is required.' }, { status: 400 });
    }

    const primaryUom = normalizeText(body.primaryUom || body.unit || 'KG');
    const secondaryUom = normalizeText(body.secondaryUom || '');
    const conversionFactor = getNumeric(body.conversionFactor, 1);
    const gstRate = getNumeric(body.gstRate, 0);
    const status = normalizeText(body.status || 'ACTIVE').toUpperCase();

    if (!primaryUom) {
      return NextResponse.json({ message: 'Primary UOM is required.' }, { status: 400 });
    }

    if (!ITEM_STATUSES.includes(status as any)) {
      return NextResponse.json({ message: 'Invalid status.' }, { status: 400 });
    }

    if (secondaryUom && conversionFactor <= 0) {
      return NextResponse.json({ message: 'Conversion factor must be greater than zero when secondary UOM is used.' }, { status: 400 });
    }

    if (gstRate < 0 || gstRate > 100) {
      return NextResponse.json({ message: 'GST rate must be between 0 and 100.' }, { status: 400 });
    }

    await connectToDatabase();
    const code = normalizeText(body.code) || buildCode(type);
    const existing = await ManufacturingItem.findOne({ ...getTenantFilter(session), type, code: code.toUpperCase() });

    if (existing) {
      return NextResponse.json({ message: 'Item code already exists for this account.' }, { status: 409 });
    }

    const item = await ManufacturingItem.create(
      appendOwnership(
        {
          code: code.toUpperCase(),
          name,
          type,
          itemType: type,
          category: normalizeText(body.category),
          subCategory: normalizeText(body.subCategory),
          grade: normalizeText(body.grade),
          variety: normalizeText(body.variety),
          unit: primaryUom,
          primaryUom,
          secondaryUom,
          conversionFactor,
          hsnCode: normalizeText(body.hsnCode),
          gstRate,
          purchaseRate: getNumeric(body.purchaseRate, 0),
          openingRate: getNumeric(body.openingRate, 0),
          openingStock: getNumeric(body.openingStock, 0),
          openingStockValue: getNumeric(body.openingStockValue, 0),
          minimumStock: getNumeric(body.minimumStock, 0),
          reorderLevel: getNumeric(body.reorderLevel, 0),
          maximumStock: getNumeric(body.maximumStock, 0),
          storageLocation: normalizeText(body.storageLocation),
          batchTrackingRequired: Boolean(body.batchTrackingRequired ?? true),
          lotTrackingRequired: Boolean(body.lotTrackingRequired ?? true),
          expiryTrackingRequired: Boolean(body.expiryTrackingRequired ?? false),
          qualityTrackingRequired: Boolean(body.qualityTrackingRequired ?? true),
          wasteType: normalizeText(body.wasteType),
          saleApplicable: Boolean(body.saleApplicable ?? false),
          saleRate: getNumeric(body.saleRate, 0),
          reusable: Boolean(body.reusable ?? false),
          recoverable: Boolean(body.recoverable ?? false),
          status,
          description: normalizeText(body.description),
          remarks: normalizeText(body.remarks),
          supplierId: body.supplierId || undefined,
          supplierName: normalizeText(body.supplierName),
          isActive: status === 'ACTIVE',
        },
        session
      )
    );

    return NextResponse.json({ item }, { status: 201 });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to create item.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ message: 'Item id is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const item = await ManufacturingItem.findOne({ _id: id, ...getTenantFilter(session) });
    if (!item) {
      return NextResponse.json({ message: 'Item not found.' }, { status: 404 });
    }

    const nextType = normalizeText(updates.type || updates.itemType || item.type).toUpperCase();
    if (!ITEM_TYPES.includes(nextType as any)) {
      return NextResponse.json({ message: 'Invalid item type.' }, { status: 400 });
    }

    const nextName = normalizeText(updates.name || item.name);
    const nextCode = normalizeText(updates.code || item.code || '').toUpperCase() || buildCode(nextType);
    const status = normalizeText(updates.status || item.status || 'ACTIVE').toUpperCase();
    if (!ITEM_STATUSES.includes(status as any)) {
      return NextResponse.json({ message: 'Invalid status.' }, { status: 400 });
    }

    const duplicate = await ManufacturingItem.findOne({
      _id: { $ne: id },
      ...getTenantFilter(session),
      type: nextType,
      code: nextCode,
    });

    if (duplicate) {
      return NextResponse.json({ message: 'Item code already exists for this account.' }, { status: 409 });
    }

    const primaryUom = normalizeText(updates.primaryUom || updates.unit || item.primaryUom || item.unit || 'KG');
    const secondaryUom = normalizeText(updates.secondaryUom ?? item.secondaryUom ?? '');
    const conversionFactor = getNumeric(updates.conversionFactor ?? item.conversionFactor ?? 1, 1);
    const gstRate = getNumeric(updates.gstRate ?? item.gstRate ?? 0, 0);

    if (secondaryUom && conversionFactor <= 0) {
      return NextResponse.json({ message: 'Conversion factor must be greater than zero when secondary UOM is used.' }, { status: 400 });
    }

    if (gstRate < 0 || gstRate > 100) {
      return NextResponse.json({ message: 'GST rate must be between 0 and 100.' }, { status: 400 });
    }

    Object.assign(item, {
      code: nextCode,
      name: nextName,
      type: nextType,
      itemType: nextType,
      category: normalizeText(updates.category ?? item.category),
      subCategory: normalizeText(updates.subCategory ?? item.subCategory),
      grade: normalizeText(updates.grade ?? item.grade),
      variety: normalizeText(updates.variety ?? item.variety),
      unit: primaryUom,
      primaryUom,
      secondaryUom,
      conversionFactor,
      hsnCode: normalizeText(updates.hsnCode ?? item.hsnCode),
      gstRate,
      purchaseRate: getNumeric(updates.purchaseRate ?? item.purchaseRate ?? 0, 0),
      openingRate: getNumeric(updates.openingRate ?? item.openingRate ?? 0, 0),
      openingStock: getNumeric(updates.openingStock ?? item.openingStock ?? 0, 0),
      openingStockValue: getNumeric(updates.openingStockValue ?? item.openingStockValue ?? 0, 0),
      minimumStock: getNumeric(updates.minimumStock ?? item.minimumStock ?? 0, 0),
      reorderLevel: getNumeric(updates.reorderLevel ?? item.reorderLevel ?? 0, 0),
      maximumStock: getNumeric(updates.maximumStock ?? item.maximumStock ?? 0, 0),
      storageLocation: normalizeText(updates.storageLocation ?? item.storageLocation),
      batchTrackingRequired: updates.batchTrackingRequired !== undefined ? Boolean(updates.batchTrackingRequired) : item.batchTrackingRequired,
      lotTrackingRequired: updates.lotTrackingRequired !== undefined ? Boolean(updates.lotTrackingRequired) : item.lotTrackingRequired,
      expiryTrackingRequired: updates.expiryTrackingRequired !== undefined ? Boolean(updates.expiryTrackingRequired) : item.expiryTrackingRequired,
      qualityTrackingRequired: updates.qualityTrackingRequired !== undefined ? Boolean(updates.qualityTrackingRequired) : item.qualityTrackingRequired,
      wasteType: normalizeText(updates.wasteType ?? item.wasteType),
      saleApplicable: updates.saleApplicable !== undefined ? Boolean(updates.saleApplicable) : item.saleApplicable,
      saleRate: getNumeric(updates.saleRate ?? item.saleRate ?? 0, 0),
      reusable: updates.reusable !== undefined ? Boolean(updates.reusable) : item.reusable,
      recoverable: updates.recoverable !== undefined ? Boolean(updates.recoverable) : item.recoverable,
      status,
      description: normalizeText(updates.description ?? item.description),
      remarks: normalizeText(updates.remarks ?? item.remarks),
      supplierId: updates.supplierId !== undefined ? updates.supplierId : item.supplierId,
      supplierName: normalizeText(updates.supplierName ?? item.supplierName),
      isActive: status === 'ACTIVE',
    });

    await item.save();
    return NextResponse.json({ item });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to update item.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Item id is required.' }, { status: 400 });
    }

    await connectToDatabase();
    const deleted = await ManufacturingItem.findOneAndDelete({ _id: id, ...getTenantFilter(session) });

    if (!deleted) {
      return NextResponse.json({ message: 'Item not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ message: 'Failed to delete item.' }, { status: 500 });
  }
}
