'use server';

import connectToDatabase from '@/lib/mongoose';
import ReceiptTemplate from '@/lib/models/ReceiptTemplate';
import { requireSession, getTenantFilter } from '@/lib/ownership';
import { revalidatePath } from 'next/cache';

export async function getReceiptTemplates(warehouseId?: string) {
  try {
    await connectToDatabase();
    const session = await requireSession();
    
    // In a real app we might filter by tenant, but for now we just fetch by warehouse if provided.
    // If not provided, fetch all for tenant.
    const query: any = {};
    if (warehouseId) {
      query.warehouseId = warehouseId;
    }
    
    // If you need tenant filtering, uncomment if ReceiptTemplate had tenantId, 
    // but typically warehouse limits it already.
    // Object.assign(query, getTenantFilter(session));

    const templates = await ReceiptTemplate.find(query)
      .populate('warehouseId', 'name')
      .lean();
      
    return { success: true, data: JSON.parse(JSON.stringify(templates)) };
  } catch (error: any) {
    console.error('Error fetching receipt templates:', error);
    return { success: false, error: error.message || 'Failed to fetch templates' };
  }
}

export async function getReceiptTemplate(warehouseId: string, receiptType: 'inward' | 'outward' | 'invoice') {
  try {
    await connectToDatabase();
    await requireSession();
    
    const template = await ReceiptTemplate.findOne({ warehouseId, receiptType }).lean();
    if (!template) {
      return { success: false, error: 'Template not found' };
    }
    
    return { success: true, data: JSON.parse(JSON.stringify(template)) };
  } catch (error: any) {
    console.error('Error fetching receipt template:', error);
    return { success: false, error: error.message || 'Failed to fetch template' };
  }
}

export async function saveReceiptTemplate(data: any) {
  try {
    await connectToDatabase();
    await requireSession();
    
    const { warehouseId, receiptType } = data;
    if (!warehouseId || !receiptType) {
      return { success: false, error: 'Warehouse ID and Receipt Type are required' };
    }
    
    const existing = await ReceiptTemplate.findOne({ warehouseId, receiptType });
    
    let result;
    if (existing) {
      result = await ReceiptTemplate.findOneAndUpdate(
        { warehouseId, receiptType },
        { $set: data },
        { new: true }
      );
    } else {
      result = await ReceiptTemplate.create(data);
    }
    
    revalidatePath('/cold/settings'); // Adjust path as needed
    revalidatePath('/cold/receipt-templates'); // Clear cache for the designer
    
    return { success: true, data: JSON.parse(JSON.stringify(result)) };
  } catch (error: any) {
    console.error('Error saving receipt template:', error);
    return { success: false, error: error.message || 'Failed to save template' };
  }
}

export async function deleteReceiptTemplate(id: string) {
  try {
    await connectToDatabase();
    await requireSession();
    
    const result = await ReceiptTemplate.findByIdAndDelete(id);
    if (!result) {
      return { success: false, error: 'Template not found' };
    }
    
    revalidatePath('/cold/settings'); // Adjust path as needed
    
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting receipt template:', error);
    return { success: false, error: error.message || 'Failed to delete template' };
  }
}
