'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import { hasPermission } from '@/lib/permissions';
import { getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';

export async function getColdClientLedger(clientId: string) {
  await connectToDatabase();

  // Touch the models to prevent Turbopack/Webpack from tree-shaking the unused imports
  const _ensureModels = [ColdCommodity, ColdWarehouse];

  const session = await requireSession();
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  const { default: Client } = await import('@/lib/models/Client');
  const client = await Client.findById(clientId).lean();
  const isPurchaseStock = client?.clientType === 'PURCHASE';

  const inwards = await ColdInward.find({ clientId, ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .lean();

  const outwards = await ColdOutward.find({ clientId, ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .lean();

  const { default: ColdTransfer } = await import('@/lib/models/ColdTransfer');
  const transfers = await ColdTransfer.find({
    $or: [{ fromClientId: clientId }, { toClientId: clientId }],
    ...tenantFilter
  })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name')
    .populate('fromClientId', 'name')
    .populate('toClientId', 'name')
    .lean();

  const combined = [
    ...inwards.map(i => ({ ...i, type: 'INWARD' })),
    ...outwards.map(o => ({ ...o, type: 'OUTWARD' })),
    ...transfers.map(t => ({ ...t, type: 'OWNERSHIP TRANSFER' }))
  ].map((t: any) => {
    let locationStr = '';

    const getFloorName = (warehouse: any, cName: any, fNo: any) => {
      if (!warehouse || !warehouse.chambers) return fNo ?? '-';
      const chamber = warehouse.chambers.find((c: any) => c.name === cName || c.chamberNo === cName);
      if (!chamber) return fNo ?? '-';
      const floor = (chamber.floors || []).find((f: any) => f.floorNo === fNo);
      return floor ? floor.name : (fNo ?? '-');
    };

    if (t.type === 'INWARD' && t.stackAllocations && t.stackAllocations.length > 0) {
      locationStr = t.stackAllocations.map((a: any) => {
        const cName = a.chamberName || a.chamberNo;
        const fName = getFloorName(t.warehouseId, cName, a.floorNo);
        return `C${cName}.F${fName}.S${a.stackNo ?? '-'}`;
      }).join(', ');
    } else if (t.type === 'OWNERSHIP TRANSFER' && t.stackAllocations && t.stackAllocations.length > 0) {
      locationStr = t.stackAllocations.map((a: any) => {
        const cName = a.chamberName || a.chamberNo;
        const fName = getFloorName(t.warehouseId, cName, a.floorNo);
        return `C${cName}.F${fName}.S${a.stackNo ?? '-'}`;
      }).join(', ');
    } else {
      const cName = t.chamberName || t.chamberNo;
      const fName = getFloorName(t.warehouseId, cName, t.floorNo);
      locationStr = `C${cName}.F${fName}.S${t.stackNo ?? '-'}`;
    }

    if (t.type === 'OWNERSHIP TRANSFER') {
      const isTransferOut = t.fromClientId._id.toString() === clientId.toString();
      let ledgerType = isTransferOut ? 'TRANSFER OUT' : 'TRANSFER IN';
      if (t.transferType === 'Purchase' && isTransferOut) ledgerType = 'PURCHASE TRANSFER';

      let warehouseName = t.warehouseId?.name;
      if (t.transferType === 'Purchase' && isTransferOut) {
        warehouseName = `Out To: Warehouse (${t.warehouseId?.name})`;
      } else if (isTransferOut) {
        warehouseName = `Out To: ${t.toClientId?.name}`;
      } else {
        warehouseName = `In From: ${t.fromClientId?.name}`;
      }

      return {
        _id: t._id.toString(),
        type: ledgerType,
        date: t.date,
        commodity: t.commodityId?.name,
        warehouse: warehouseName,
        location: locationStr,
        quantityKg: t.quantityKg,
        plusMinus: null,
        totalBags: t.bagsCount,
        createdAt: t.createdAt,
        isPurchaseStock
      };
    }

    return {
      _id: t._id.toString(),
      type: t.type,
      date: t.date,
      commodity: t.commodityId?.name,
      warehouse: t.warehouseId?.name,
      location: locationStr,
      quantityKg: t.quantityKg,
      plusMinus: t.type === 'OUTWARD' ? (t.plusMinus || 0) : null,
      totalBags: t.totalBags || t.bagsCount,
      createdAt: t.createdAt,
      isPurchaseStock,
      remarks: t.remarks,
      stockType: t.stockType,
      purchaseQuantityKg: t.purchaseQuantityKg,
      selfQuantityKg: t.selfQuantityKg
    };
  }).filter((t: any) => {
    // Prevent double-counting of the automatically generated inward/outward records for Self ownership transfers
    if (t.type === 'INWARD' && (t as any).remarks === 'Ownership Transfer In') return false;
    if (t.type === 'OUTWARD' && (t as any).remarks === 'Ownership Transfer Out') return false;
    if (t.type === 'OUTWARD' && (t as any).remarks === 'Ownership Transfer Purchase') return false;
    return true;
  });

  // Sort by date ASCENDING for ledger
  combined.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return JSON.parse(JSON.stringify(combined));
}
