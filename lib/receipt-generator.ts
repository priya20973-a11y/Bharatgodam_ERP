import mongoose from 'mongoose';
import ReceiptSequence from './models/ReceiptSequence';
import ColdWarehouse from './models/ColdWarehouse';

export type ReceiptType = 'inward' | 'outward' | 'invoice';

export async function generateReceiptNumber(
  warehouseId: string | mongoose.Types.ObjectId,
  type: ReceiptType,
  chamberName?: string
): Promise<string | undefined> {
  const warehouse = await ColdWarehouse.findById(warehouseId).lean();
  if (!warehouse || !warehouse.receiptConfig || !warehouse.receiptConfig[type]) {
    return undefined; // Fallback or not configured
  }

  const config = warehouse.receiptConfig[type];
  const isChamberWise = config.numberingType === 'CHAMBER_WISE';

  // Ensure chamberName is provided if CHAMBER_WISE is used
  const actualChamberName = isChamberWise ? chamberName : undefined;

  // Atomically increment the sequence or initialize it if it doesn't exist.
  // Mongoose findOneAndUpdate with $inc handles initialization to $inc value if upsert is true.
  // But we want to start from `config.startingNumber`.
  // To handle this, we can set the default in `setOnInsert`.
  
  // NOTE: If updateColdWarehouse changes the startingNumber to something higher,
  // it should update the ReceiptSequence record's lastNumber to `newStartingNumber - 1`.
  
  const sequenceType = type.toUpperCase() as 'INWARD' | 'OUTWARD' | 'INVOICE';

  let sequence = await ReceiptSequence.findOneAndUpdate(
    { warehouseId: new mongoose.Types.ObjectId(warehouseId.toString()), type: sequenceType, chamberName: actualChamberName },
    { $inc: { lastNumber: 1 } },
    { new: true }
  );

  if (!sequence) {
    // Doesn't exist, create it with startingNumber
    try {
      sequence = await ReceiptSequence.create({
        warehouseId: new mongoose.Types.ObjectId(warehouseId.toString()),
        type: sequenceType,
        chamberName: actualChamberName,
        lastNumber: config.startingNumber
      });
    } catch (error: any) {
      // If it fails due to unique constraint, it means another request just created it.
      // In that case, retry the findOneAndUpdate.
      if (error.code === 11000) {
        sequence = await ReceiptSequence.findOneAndUpdate(
          { warehouseId: new mongoose.Types.ObjectId(warehouseId.toString()), type: sequenceType, chamberName: actualChamberName },
          { $inc: { lastNumber: 1 } },
          { new: true }
        );
      } else {
        throw error;
      }
    }
  }

  if (!sequence) {
    return undefined;
  }

  const numStr = sequence.lastNumber.toString().padStart(config.numberPadding || 1, '0');
  
  const parts = [];
  if (config.prefix) parts.push(config.prefix);
  if (isChamberWise && chamberName) parts.push(chamberName);
  parts.push(numStr);
  if (config.suffix) parts.push(config.suffix);

  return parts.join('-');
}
