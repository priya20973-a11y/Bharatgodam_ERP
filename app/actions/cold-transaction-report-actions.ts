'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdCommodity from '@/lib/models/ColdCommodity';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { getTenantFilter, requireSession, getWarehouseFilter } from '@/lib/ownership';
import { getStackAvailableCapacity } from './cold-inward-actions';

export async function getColdTransactions() {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  const inwards = await ColdInward.find(tenantFilter)
    .populate('clientId', 'name')
    .populate('commodityId', 'name type gradingType')
    .populate('warehouseId', 'name warehouseId')
    .lean();

  const outwards = await ColdOutward.find(tenantFilter)
    .populate('clientId', 'name')
    .populate('commodityId', 'name type gradingType')
    .populate('warehouseId', 'name warehouseId')
    .lean();

  const combined = [
    ...inwards.map(i => ({ ...i, type: 'INWARD' })),
    ...outwards.map(o => ({ ...o, type: 'OUTWARD' }))
  ].map((t: any) => ({
    _id: t._id.toString(),
    type: t.type,
    date: t.date,
    client: { _id: t.clientId?._id?.toString(), name: t.clientId?.name },
    commodity: { _id: t.commodityId?._id?.toString(), name: t.commodityId?.name, type: t.commodityId?.type },
    warehouse: { _id: t.warehouseId?._id?.toString(), name: t.warehouseId?.name },
    chamberNo: t.type === 'INWARD' ? (t.stackAllocations?.[0]?.chamberName || t.stackAllocations?.[0]?.chamberNo || '') : (t.chamberName || t.chamberNo),
    floorNo: t.type === 'INWARD' ? (t.stackAllocations?.[0]?.floorNo || '') : t.floorNo,
    stackNo: t.type === 'INWARD' ? (t.stackAllocations?.[0]?.stackNo || '') : t.stackNo,
    quantityKg: t.quantityKg,
    bagsCount: t.totalBags !== undefined ? t.totalBags : t.bagsCount,
    grade: t.grade,
    gradingType: t.gradingType || t.commodityId?.gradingType,
    referencePersons: t.referencePersons,
    createdAt: t.createdAt,
    stockType: t.stockType,
    purchaseQuantityKg: t.purchaseQuantityKg,
    selfQuantityKg: t.selfQuantityKg
  }));

  // Sort by date DESC, then createdAt DESC
  combined.sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateB !== dateA) return dateB - dateA;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return JSON.parse(JSON.stringify(combined));
}

export async function deleteColdTransaction(id: string, type: 'INWARD' | 'OUTWARD') {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'reports', 'delete')) throw new Error('Forbidden: Insufficient permissions');
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  try {
    if (type === 'INWARD') {
      const inward = await ColdInward.findOne({ _id: id, ...tenantFilter });
      if (!inward) throw new Error('Transaction not found');

      // Validation: Block edit/delete of Inward if Outward exists for that specific transaction.
      // We check if any outward exists for this client, commodity, and stack.
      const outwardExists = await ColdOutward.exists({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        $or: inward.stackAllocations.map((s: any) => ({
          $or: [ { chamberName: s.chamberName || s.chamberNo?.toString() }, ...(s.chamberNo ? [{ chamberNo: s.chamberNo }] : []) ],
          floorNo: s.floorNo,
          stackNo: s.stackNo
        })),
        ...tenantFilter
      });

      if (outwardExists) {
        return { success: false, error: 'Cannot edit/delete. Outward transaction exists.' };
      }

      await ColdInward.deleteOne({ _id: id });
    } else {
      const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter });
      if (!outward) throw new Error('Transaction not found');
      await ColdOutward.deleteOne({ _id: id });
    }

    revalidatePath('/cold/transactions-report');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/outward');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete transaction' };
  }
}

export async function getColdTransactionById(id: string, type: 'INWARD' | 'OUTWARD') {
  await connectToDatabase();
  const session = await requireSession();
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  let transaction;
  if (type === 'INWARD') {
    const inward = await ColdInward.findOne({ _id: id, ...tenantFilter }).lean();
    if (!inward) throw new Error('Inward transaction not found');

    // Check if any outward exists for this inward stack
    const outwardExists = await ColdOutward.exists({
      clientId: inward.clientId,
      commodityId: inward.commodityId,
      warehouseId: inward.warehouseId,
      $or: inward.stackAllocations.map((s: any) => ({
        $or: [ { chamberName: s.chamberName || s.chamberNo?.toString() }, ...(s.chamberNo ? [{ chamberNo: s.chamberNo }] : []) ],
        floorNo: s.floorNo,
        stackNo: s.stackNo
      })),
      ...tenantFilter
    });

    transaction = { ...inward, type: 'INWARD', hasOutward: !!outwardExists };
  } else {
    const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter }).lean();
    if (!outward) throw new Error('Outward transaction not found');
    transaction = { ...outward, type: 'OUTWARD' };
  }

  return JSON.parse(JSON.stringify(transaction));
}

export async function updateColdTransaction(id: string, type: 'INWARD' | 'OUTWARD', data: any) {
  await connectToDatabase();
  const session = await requireSession();
  if (!hasPermission(session, 'reports', 'edit')) throw new Error('Forbidden: Insufficient permissions');
  const tenantFilter = { ...getTenantFilter(session), ...getWarehouseFilter(session) };

  try {
    if (data && data.grade === '') {
      data.grade = undefined;
    }

    if (type === 'INWARD') {
      const inward = await ColdInward.findOne({ _id: id, ...tenantFilter });
      if (!inward) throw new Error('Transaction not found');

      const outwardExists = await ColdOutward.exists({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        $or: inward.stackAllocations.map((s: any) => ({
          $or: [ { chamberName: s.chamberName || s.chamberNo?.toString() }, ...(s.chamberNo ? [{ chamberNo: s.chamberNo }] : []) ],
          floorNo: s.floorNo,
          stackNo: s.stackNo
        })),
        ...tenantFilter
      });

      if (outwardExists) {
        return { success: false, error: 'Cannot edit Inward. Related Outward transaction exists.' };
      }

      if (data.stackAllocations) {
        for (const stack of data.stackAllocations) {
          const capacityInfo = await getStackAvailableCapacity(inward.warehouseId.toString(), stack.chamberNo, stack.floorNo, stack.stackNo);
          
          const currentAllocation = inward.stackAllocations.find((s: any) => 
            (s.chamberName === stack.chamberName || s.chamberNo === stack.chamberNo) && 
            s.floorNo === stack.floorNo && 
            s.stackNo === stack.stackNo
          );
          const currentWeight = currentAllocation ? currentAllocation.allocatedWeight : 0;
          
          const trueAvailable = capacityInfo.availableCapacity + currentWeight;
          
          if (stack.allocatedWeight > trueAvailable) {
             return { success: false, error: `Quantity exceeds available stack capacity in Chamber ${stack.chamberNo}, Floor ${stack.floorNo}, Stack ${stack.stackNo}. Available: ${trueAvailable} Kg` };
          }
        }
      }

      // Update inward fields
      Object.assign(inward, data);
      
      if (data.stackAllocations) {
        inward.quantityKg = data.stackAllocations.reduce((sum: number, s: any) => sum + (Number(s.allocatedWeight) || 0), 0);
      }
      
      inward.totalBags = (inward.bagsCount || 0) + (inward.jin || 0) + (inward.mixed || 0);
      
      await inward.save();
    } else {
      const outward = await ColdOutward.findOne({ _id: id, ...tenantFilter });
      if (!outward) throw new Error('Transaction not found');

      // Fetch the related inward based on inwardId or the matching stack details
      let inward;
      if (outward.inwardId) {
        inward = await ColdInward.findOne({ _id: outward.inwardId, ...tenantFilter });
      } else {
        inward = await ColdInward.findOne({
          clientId: outward.clientId,
          commodityId: outward.commodityId,
          warehouseId: outward.warehouseId,
          $or: [
            { 'stackAllocations.chamberName': outward.chamberName || outward.chamberNo?.toString() },
            ...(outward.chamberNo ? [{ 'stackAllocations.chamberNo': outward.chamberNo }] : [])
          ],
          'stackAllocations.floorNo': outward.floorNo,
          'stackAllocations.stackNo': outward.stackNo,
          ...tenantFilter
        });
      }

      if (!inward) throw new Error('Related Inward transaction not found for validation');

      const outwardDate = new Date(data.date);
      const inwardDate = new Date(inward.date);
      if (outwardDate < inwardDate) {
        return { success: false, error: 'Outward date cannot be before the related Inward date.' };
      }

      // Find all OTHER outwards for this inward to calculate available capacity correctly
      const otherOutwards = await ColdOutward.find({
        clientId: inward.clientId,
        commodityId: inward.commodityId,
        warehouseId: inward.warehouseId,
        $or: [
          { chamberName: outward.chamberName || outward.chamberNo?.toString() },
          ...(outward.chamberNo ? [{ chamberNo: outward.chamberNo }] : [])
        ],
        floorNo: outward.floorNo,
        stackNo: outward.stackNo,
        _id: { $ne: outward._id },
        ...tenantFilter
      });

      const totalOtherOutwardQty = otherOutwards.reduce((sum, o) => sum + o.quantityKg, 0);
      const availableQtyForThisEdit = inward.quantityKg - totalOtherOutwardQty;

      if (data.quantityKg > availableQtyForThisEdit) {
        return { success: false, error: `Quantity exceeds available balance (${availableQtyForThisEdit} Kg).` };
      }

      let rentRs = 0;
      let rentReason = '';
      const commodity = await ColdCommodity.findById(outward.commodityId);
      
      if (commodity && commodity.seasonalPrices && commodity.seasonalPrices.length > 0) {
        const outTime = outwardDate.getTime();
        const season = commodity.seasonalPrices.find((s: any) => outTime >= new Date(s.fromDate).getTime() && outTime <= new Date(s.toDate).getTime()) || commodity.seasonalPrices[0];
        
        if (season) {
          const bagsLarge = Number(data.bagsCount) || 0;
          const bagsSmall = Number(data.jin) || 0;
          const bagsMixed = Number(data.mixed) || 0;
          const totalBags = bagsLarge + bagsSmall + bagsMixed;
          const quantityKg = Number(data.quantityKg) || 0;

          let pLarge = 0, pSmall = 0, pMixed = 0;
          let baseUnitRate = 0;

          if (commodity.priceType === 'Different Price') {
            pLarge = season.priceLarge || 0;
            pSmall = season.priceSmall || 0;
            pMixed = season.priceMixed || 0;
            baseUnitRate = pLarge;
            if (!pLarge && !pSmall && !pMixed) rentReason = 'Rates not found for any bag types';
          } else {
            baseUnitRate = season.pricePerKg || 0;
            if (!baseUnitRate) rentReason = 'Price Per Unit not set';
          }

          const unit = (commodity.unit || 'KG').toUpperCase();
          const isKg = unit === 'KG' || unit === 'KILOGRAM' || unit === 'KGS';

          if (isKg) {
            let largeWeight = 0, smallWeight = 0, mixedWeight = 0;
            if (totalBags > 0) {
              largeWeight = (bagsLarge / totalBags) * quantityKg;
              smallWeight = (bagsSmall / totalBags) * quantityKg;
              mixedWeight = (bagsMixed / totalBags) * quantityKg;
            } else {
              largeWeight = quantityKg; // Fallback
            }

            if (commodity.priceType === 'Different Price') {
              if (commodity.gradingType === 'Wet') {
                const rateLarge = (largeWeight / 81) * pLarge * 4;
                const rateSmall = (smallWeight / 81) * pSmall * 4;
                const rateMixed = (mixedWeight / 81) * pMixed * 4;
                rentRs = rateLarge + rateSmall + rateMixed;
              } else {
                const rateLarge = largeWeight * pLarge;
                const rateSmall = smallWeight * pSmall;
                const rateMixed = mixedWeight * pMixed;
                rentRs = rateLarge + rateSmall + rateMixed;
              }
            } else {
              rentRs = quantityKg * baseUnitRate;
            }
          } else {
            // Storage Unit != KG
            if (commodity.priceType === 'Different Price') {
              rentRs = (bagsLarge * pLarge) + (bagsSmall * pSmall) + (bagsMixed * pMixed);
            } else {
              rentRs = totalBags * baseUnitRate;
            }
          }
        } else {
          rentReason = 'Seasonal price not found for date';
        }
      } else {
        rentReason = 'Commodity pricing not configured';
      }

      Object.assign(outward, data);
      outward.rentRs = rentRs;
      outward.rentReason = rentReason;
      await outward.save();
    }

    revalidatePath('/cold/transactions-report');
    revalidatePath('/cold/inward');
    revalidatePath('/cold/outward');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update transaction' };
  }
}
