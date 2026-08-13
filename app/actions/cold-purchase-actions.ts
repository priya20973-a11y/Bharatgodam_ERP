'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import ColdOutward from '@/lib/models/ColdOutward';
import ColdTransfer from '@/lib/models/ColdTransfer';
import { getTenantFilter, requireSession } from '@/lib/ownership';
import mongoose from 'mongoose';
import '@/lib/models/ColdCommodity';

export async function getPurchaseStock(warehouseId: string) {
  try {
    await connectToDatabase();
    const session = await requireSession();

    if (!warehouseId || !mongoose.Types.ObjectId.isValid(warehouseId)) {
      return { success: false, error: 'Invalid warehouse ID' };
    }

    const warehouse = await ColdWarehouse.findOne({ _id: warehouseId, ...getTenantFilter(session) }).lean();
    if (!warehouse) return { success: false, error: 'Warehouse not found' };

    // Fetch all active/partial inwards for this warehouse
    const activeInwards = await ColdInward.find({
      warehouseId: new mongoose.Types.ObjectId(warehouseId),
      status: { $in: ['Active', 'Partial'] },
      'stackAllocations.stockType': 'Purchase',
      ...getTenantFilter(session)
    })
      .populate('clientId', 'name clientType')
      .populate('commodityId', 'name type')
      .lean();

    if (!activeInwards || activeInwards.length === 0) {
      return { success: true, data: [] };
    }

    const inwardIds = activeInwards.map((i: any) => i._id);

    // Fetch all outwards related to these inwards (ONLY outwards made by the warehouse, i.e., Purchase outwards)
    const outwardsDocs = await ColdOutward.find({
      warehouseId: new mongoose.Types.ObjectId(warehouseId),
      clientId: new mongoose.Types.ObjectId(warehouseId),
      clientModel: 'ColdWarehouse',
      inwardId: { $in: inwardIds },
      ...getTenantFilter(session)
    }).lean();

    // Map outwards by InwardId + Chamber + Floor + Stack
    // Since outward might use chamberName or chamberNo, we use a flexible key.
    const outwardMap = new Map();
    outwardsDocs.forEach((o: any) => {
      if (o.inwardId) {
        // Build key like: InwardId_ChamberNameOrNo_FloorNo_StackNo
        const chamberKey = o.chamberName ? String(o.chamberName).toLowerCase() : (o.chamberNo ? String(o.chamberNo) : '');
        const key = `${o.inwardId.toString()}_${chamberKey}_${o.floorNo}_${o.stackNo}`;
        const current = outwardMap.get(key) || 0;
        outwardMap.set(key, current + (Number(o.quantityKg) || 0));
      }
    });

    const purchaseStockList: any[] = [];

    activeInwards.forEach((inward: any) => {
      // Find previous owner if it was transferred
      const commodityDisplay = inward.commodityId 
        ? `${inward.commodityId.name}${inward.commodityId.type ? ` (${inward.commodityId.type})` : ''}` 
        : 'Unknown';
      
      const clientNameDisplay = inward.clientId?.name || inward.farmerName || inward.referencePersons?.[0]?.name || 'Unknown';

      // Iterate through stack allocations
      inward.stackAllocations.forEach((alloc: any) => {
        if (alloc.stockType === 'Purchase') {
          const allocWeight = Number(alloc.allocatedWeight) || 0;
          if (allocWeight > 0) {
            const chamberKeyName = alloc.chamberName ? String(alloc.chamberName).toLowerCase() : '';
            const chamberKeyNo = alloc.chamberNo ? String(alloc.chamberNo) : '';
            
            const keyWithName = `${inward._id.toString()}_${chamberKeyName}_${alloc.floorNo}_${alloc.stackNo}`;
            const keyWithNo = `${inward._id.toString()}_${chamberKeyNo}_${alloc.floorNo}_${alloc.stackNo}`;
            
            let outQty = outwardMap.get(keyWithName) || 0;
            if (outQty === 0 && chamberKeyNo && chamberKeyNo !== chamberKeyName) {
                outQty = outwardMap.get(keyWithNo) || 0;
            }

            const available = Math.max(0, allocWeight - outQty);

            if (available > 0) {
              purchaseStockList.push({
                inwardId: inward._id.toString(),
                receiptNo: inward.weighbridgeSlipNo || inward.receiptNo || `INW-${inward._id.toString().slice(-6).toUpperCase()}`,
                date: inward.createdAt || inward.date,
                clientName: clientNameDisplay,
                farmerName: inward.farmerName || '-',
                referencePerson: inward.referencePersons && inward.referencePersons.length > 0 
                  ? inward.referencePersons.map((rp: any) => rp.name).join(', ') 
                  : '-',
                commodity: commodityDisplay,
                chamber: alloc.chamberName || alloc.chamberNo,
                floor: alloc.floorNo,
                stack: alloc.stackNo,
                purchaseQuantity: allocWeight,
                availableQuantity: available,
                unit: inward.unit || 'KG'
              });
            }
          }
        }
      });
    });

    return {
      success: true,
      data: purchaseStockList
    };

  } catch (error: any) {
    console.error('Error fetching purchase stock:', error);
    return { success: false, error: error.message || 'Something went wrong' };
  }
}
