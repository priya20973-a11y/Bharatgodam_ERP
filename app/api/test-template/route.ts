import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ReceiptTemplate from '@/lib/models/ReceiptTemplate';
import ColdWarehouse from '@/lib/models/ColdWarehouse';

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    const warehouse = await ColdWarehouse.findOne().lean();
    if (!warehouse) return new NextResponse('No warehouse found', { status: 404 });
    
    const data = {
      warehouseId: warehouse._id,
      receiptType: 'inward' as const,
      templateName: 'Test Template',
      paperWidth: 210,
      paperHeight: 297,
      orientation: 'portrait' as const,
      fields: [{ key: 'clientName', x: 10, y: 10, fontSize: 12, fontWeight: 'normal', align: 'left' as const, visible: true }]
    };

    const existing = await ReceiptTemplate.findOne({ warehouseId: data.warehouseId, receiptType: data.receiptType });
    let result;
    if (existing) {
      result = await ReceiptTemplate.findOneAndUpdate(
        { warehouseId: data.warehouseId, receiptType: data.receiptType },
        { $set: data },
        { new: true, runValidators: true }
      );
    } else {
      result = await ReceiptTemplate.create(data);
    }

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error('Test API Error:', error);
    return NextResponse.json({ success: false, error: error.message, stack: error.stack });
  }
}
