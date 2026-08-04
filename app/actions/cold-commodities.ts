'use server';

import connectToDatabase from '@/lib/mongoose';
import ColdCommodity, { ISeasonalPrice, IColdCommodity } from '@/lib/models/ColdCommodity';
import Client from '@/lib/models/Client';
import { revalidatePath } from 'next/cache';
import { hasPermission } from '@/lib/permissions';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function fetchColdCommodities() {
  await connectToDatabase();
  const session = await requireSession();
  const items = await ColdCommodity.find({ ...getTenantFilter(session) }).sort({ name: 1 });
  const db = await getDb();

  const uniqueUserIds = [...new Set(items.map((item: any) => item.userId?.toString()).filter(Boolean))];
  const userIds = uniqueUserIds.map(id => new ObjectId(id as string));
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

  return JSON.parse(JSON.stringify(items.map((item: any) => {
    const userId = item.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.fullName || userInfo?.companyName || userInfo?.email || (item.userId ? 'Unknown' : 'System');

    return {
      _id: item._id,
      name: item.name,
      type: item.type,
      unit: item.unit,
      qualityParameters: item.qualityParameters,
      gradingCharge: item.gradingCharge,
      priceType: item.priceType,
      seasonalPrices: item.seasonalPrices,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      userId: item.userId,
      userEmail: item.userEmail,
      wspName,
    };
  })));
}

function validateSeasonalPrices(prices: ISeasonalPrice[], priceType?: string): { valid: boolean; error?: string } {
  if (!prices || prices.length === 0) {
    return { valid: false, error: 'At least one seasonal price row is required.' };
  }

  for (const p of prices) {
    if (!p.fromDate || !p.toDate) {
      return { valid: false, error: 'Both fromDate and toDate are required.' };
    }
    if (new Date(p.fromDate) > new Date(p.toDate)) {
      return { valid: false, error: 'Invalid range: fromDate cannot be greater than toDate.' };
    }
    
    if (priceType !== 'Different Price') {
      if (p.pricePerKg === undefined || isNaN(p.pricePerKg) || p.pricePerKg <= 0) {
        return { valid: false, error: 'Price per KG is required and must be greater than 0.' };
      }
    } else if (priceType === 'Different Price') {
      if (p.priceLarge === undefined || isNaN(p.priceLarge) || p.priceLarge <= 0) {
        return { valid: false, error: 'Large grade price is required and must be greater than 0.' };
      }
      if (p.priceSmall === undefined || isNaN(p.priceSmall) || p.priceSmall <= 0) {
        return { valid: false, error: 'Small grade price is required and must be greater than 0.' };
      }
      if (p.priceMixed === undefined || isNaN(p.priceMixed) || p.priceMixed <= 0) {
        return { valid: false, error: 'Mixed grade price is required and must be greater than 0.' };
      }
    }
  }

  // Check for overlaps
  const sorted = [...prices].sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    if (new Date(sorted[i].toDate) >= new Date(sorted[i+1].fromDate)) {
      return { valid: false, error: 'Overlapping date ranges detected.' };
    }
  }

  return { valid: true };
}

export async function addColdCommodity(data: { name: string; type: string; unit?: string; qualityParameters?: any[]; gradingCharge?: any; priceType?: string; seasonalPrices: ISeasonalPrice[] }) {
  await connectToDatabase();
  try {
    console.log('addColdCommodity received:', JSON.stringify(data, null, 2));
    const session = await requireSession();
    if (!hasPermission(session, 'commodity', 'create')) throw new Error('Forbidden: Insufficient permissions');
    const nameVal = data.name.trim().toUpperCase();

    const validation = validateSeasonalPrices(data.seasonalPrices, data.priceType);
    if (!validation.valid) {
      console.error('Validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    const email = session.user.email?.trim().toLowerCase() || null;
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email
          ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }]
          : [])
      ]
    };

    const existingCommodity = await ColdCommodity.findOne({
      ...ownerFilter,
      name: nameVal,
      type: data.type.trim()
    });

    if (existingCommodity) {
      return { success: false, error: 'Commodity name and type already exists for this WSP. Please use a different name or type.' };
    }

    const item = await ColdCommodity.create(appendOwnership({ 
      name: nameVal,
      type: data.type.trim(),
      unit: data.unit || 'KG',
      qualityParameters: data.qualityParameters || [],
      gradingCharge: data.gradingCharge,
      priceType: data.priceType,
      seasonalPrices: data.seasonalPrices
    }, session));
    
    revalidatePath('/cold/commodities');
    console.log('Successfully saved cold commodity:', item._id);
    return { success: true, data: JSON.parse(JSON.stringify(item)) };
  } catch (error: any) {
    console.error('Error saving cold commodity:', error);
    if (error.code === 11000) {
      return { success: false, error: 'Commodity name already exists for this WSP. Please use a different name.' };
    }
    return { success: false, error: error.message };
  }
}

export async function updateColdCommodity(id: string, data: { name: string; type: string; unit?: string; qualityParameters?: any[]; gradingCharge?: any; priceType?: string; seasonalPrices: ISeasonalPrice[] }) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'commodity', 'edit')) throw new Error('Forbidden: Insufficient permissions');
    const nameVal = data.name.trim().toUpperCase();

    const validation = validateSeasonalPrices(data.seasonalPrices, data.priceType);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const email = session.user.email?.trim().toLowerCase() || null;
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email
          ? [{ userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }]
          : [])
      ]
    };

    const existingCommodity = await ColdCommodity.findOne({
      _id: { $ne: id },
      ...ownerFilter,
      name: nameVal,
      type: data.type.trim()
    });

    if (existingCommodity) {
      return { success: false, error: 'Commodity name and type already exists for this WSP. Please use a different name or type.' };
    }

    const item = await ColdCommodity.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      { 
        name: nameVal,
        type: data.type.trim(),
        unit: data.unit || 'KG',
        qualityParameters: data.qualityParameters || [],
        gradingCharge: data.gradingCharge,
        priceType: data.priceType,
        seasonalPrices: data.seasonalPrices
      },
      { new: true }
    );
    
    revalidatePath('/cold/commodities');
    return { success: true, data: JSON.parse(JSON.stringify(item)) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, error: 'Commodity name already exists for this WSP. Please use a different name.' };
    }
    return { success: false, error: error.message };
  }
}

export async function deleteColdCommodity(id: string) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    if (!hasPermission(session, 'commodity', 'delete')) throw new Error('Forbidden: Insufficient permissions');

    // Check if the commodity is referenced by any Client record
    // We check `coldCommodityIds` or similar when we implement Client Master for Cold Storage, 
    // but for now we'll check standard commodityIds just in case they are shared, though they shouldn't be.
    // If we create a separate ColdClient, we should check that instead.
    const clientReferenced = await Client.findOne({ commodityIds: id });
    if (clientReferenced) {
      return {
        success: false,
        error: 'Commodity cannot be deleted because it is assigned to one or more clients.'
      };
    }

    await ColdCommodity.findOneAndDelete({ _id: id, ...getTenantFilter(session) });
    revalidatePath('/cold/commodities');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Utility function to get the Cold Storage price per KG for a given transaction month.
 * @param commodity The cold commodity object containing seasonalPrices
 * @param date The transaction date
 * @returns The price per KG, or null if no season covers that month.
 */
export async function getColdStoragePriceForDate(commodity: any, date: Date | string): Promise<number | null> {
  if (!commodity || !commodity.seasonalPrices || !Array.isArray(commodity.seasonalPrices)) {
    return null;
  }
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  for (const season of commodity.seasonalPrices) {
    const from = new Date(season.fromDate);
    const to = new Date(season.toDate);
    if (d >= from && d <= to) {
      return season.pricePerKg;
    }
  }

  return null;
}
