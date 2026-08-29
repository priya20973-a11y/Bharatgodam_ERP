'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import { hasPermission } from '@/lib/permissions';
import { getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import { formatChamberDisplay, formatFloorDisplay } from '@/lib/utils/cold-naming';

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
    .populate('warehouseId', 'name chambers')
    .lean();

  const outwards = await ColdOutward.find({ clientId, ...tenantFilter })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name chambers')
    .lean();

  const { default: ColdTransfer } = await import('@/lib/models/ColdTransfer');
  const transfers = await ColdTransfer.find({
    $and: [{ $or: [{ fromClientId: clientId }, { toClientId: clientId }] }],
    ...tenantFilter
  })
    .populate('commodityId', 'name type')
    .populate('warehouseId', 'name chambers')
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
        return `${formatChamberDisplay(cName, cName)}/${formatFloorDisplay(fName, a.floorNo)}/S${a.stackNo ?? '-'}`;
      }).join(', ');
    } else if (t.type === 'OWNERSHIP TRANSFER' && t.stackAllocations && t.stackAllocations.length > 0) {
      locationStr = t.stackAllocations.map((a: any) => {
        const cName = a.chamberName || a.chamberNo;
        const fName = getFloorName(t.warehouseId, cName, a.floorNo);
        return `${formatChamberDisplay(cName, cName)}/${formatFloorDisplay(fName, a.floorNo)}/S${a.stackNo ?? '-'}`;
      }).join(', ');
    } else {
      const cName = t.chamberName || t.chamberNo;
      const fName = getFloorName(t.warehouseId, cName, t.floorNo);
      locationStr = `${formatChamberDisplay(cName, cName)}/${formatFloorDisplay(fName, t.floorNo)}/S${t.stackNo ?? '-'}`;
    }

    const getInwardNetWeight = (doc: any) => {
      if (doc.quantityKg !== undefined && doc.quantityKg !== null && Number(doc.quantityKg) > 0) {
        return Number(doc.quantityKg);
      }
      if (doc.grossWeight && doc.emptyWeight && Number(doc.grossWeight) > Number(doc.emptyWeight)) {
        return Number(doc.grossWeight) - Number(doc.emptyWeight);
      }
      if (doc.grossWeight && Number(doc.grossWeight) > 0) {
        return Number(doc.grossWeight);
      }
      return 0;
    };

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

      const netWeight = getInwardNetWeight(t);

      return {
        _id: t._id.toString(),
        type: ledgerType,
        date: t.date,
        commodity: t.commodityId?.name,
        warehouse: warehouseName,
        location: locationStr,
        quantityKg: netWeight,
        grossWeight: t.grossWeight || 0,
        emptyWeight: t.emptyWeight || 0,
        plusMinus: null,
        netWeightLoss: null,
        totalBags: t.bagsCount,
        createdAt: t.createdAt,
        isPurchaseStock
      };
    }

    const netWeight = getInwardNetWeight(t);

    let computedSelfWt = t.selfQuantityKg;
    let computedSelfBags = t.selfBagsCount;
    let computedPurWt = t.purchaseQuantityKg;
    let computedPurBags = t.purchaseBagsCount;

    if (t.type === 'INWARD' && t.stackAllocations && t.stackAllocations.length > 0) {
      let sWt = 0;
      let sBags = 0;
      let pWt = 0;
      let pBags = 0;
      let hasStackStockType = false;

      t.stackAllocations.forEach((alloc: any) => {
        const wt = Number(alloc.allocatedWeight || 0);
        const bg = Number(alloc.bagsCount || 0);
        if (alloc.stockType === 'Purchase') {
          pWt += wt;
          pBags += bg;
          hasStackStockType = true;
        } else if (alloc.stockType === 'Self') {
          sWt += wt;
          sBags += bg;
          hasStackStockType = true;
        }
      });

      if (hasStackStockType && (sWt > 0 || pWt > 0)) {
        computedSelfWt = sWt;
        computedSelfBags = sBags;
        computedPurWt = pWt;
        computedPurBags = pBags;
      }
    }

    return {
      _id: t._id.toString(),
      type: t.type,
      date: t.date,
      commodity: t.commodityId?.name,
      warehouse: t.warehouseId?.name,
      location: locationStr,
      quantityKg: netWeight,
      grossWeight: t.grossWeight || 0,
      emptyWeight: t.emptyWeight || 0,
      plusMinus: t.type === 'OUTWARD' ? (t.plusMinus || 0) : null,
      netWeightLoss: t.type === 'OUTWARD' ? (t.netWeightLoss || null) : null,
      totalBags: t.totalBags || t.bagsCount,
      createdAt: t.createdAt,
      isPurchaseStock,
      remarks: t.remarks,
      stockType: t.stockType,
      purchaseQuantityKg: computedPurWt ?? t.purchaseQuantityKg,
      purchaseBagsCount: computedPurBags ?? t.purchaseBagsCount,
      selfQuantityKg: computedSelfWt ?? t.selfQuantityKg,
      selfBagsCount: computedSelfBags ?? t.selfBagsCount
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
