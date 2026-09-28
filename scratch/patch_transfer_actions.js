const fs = require('fs');
const mongoose = require('mongoose');
const file = 'app/actions/cold-transfer-actions.ts';
let content = fs.readFileSync(file, 'utf8');

const newFuncStr = `export async function createOwnershipTransfer(data: {
  fromClientId?: string;
  toClientId: string;
  inwardId?: string;
  transferDate: string;
  transferWeight?: number;
  transferBags?: number;
  transferType?: 'Self' | 'Purchase';
  sources?: Array<{
    fromClientId: string;
    inwardId: string;
    transferWeight: number;
    transferBags: number;
  }>;
}) {
  await requireWspActionPermission('inward');
  await connectToDatabase();
  const session = await requireSession();
  
  if (!hasPermission(session, 'ownershipTransfer', 'create')) {
    throw new Error('403_FORBIDDEN: Unauthorized access to create ownership transfer');
  }

  const transferType = data.transferType || 'Self';
  const transferDateObj = new Date(data.transferDate);
  const toClientId = data.toClientId;
  
  // Normalize sources
  const sources = data.sources || [];
  if (data.inwardId && data.fromClientId && data.transferWeight !== undefined && data.transferBags !== undefined) {
    sources.push({
      fromClientId: data.fromClientId,
      inwardId: data.inwardId,
      transferWeight: data.transferWeight,
      transferBags: data.transferBags
    });
  }
  
  if (sources.length === 0) {
    return { success: false, error: 'No sources selected for transfer.' };
  }

  // Validate all sources first
  const validatedSources = [];
  for (const source of sources) {
    const availableInwards = await getAvailableInwardsForTransfer(source.fromClientId, transferType);
    const targetInward = availableInwards.find((inv: any) => inv._id.toString() === source.inwardId);

    if (!targetInward) {
      return { success: false, error: \`Inward receipt not found or has 0 available stock for selected client.\` };
    }

    if (targetInward.availableQty <= 0) {
      return { success: false, error: \`Cannot transfer. Available stock is 0 for receipt \${targetInward.receiptNumber}.\` };
    }

    if (source.transferWeight > targetInward.availableQty) {
      return { success: false, error: \`Transfer weight exceeds available stock for receipt \${targetInward.receiptNumber}.\` };
    }
    
    if (source.transferBags > targetInward.availableBags) {
      return { success: false, error: \`Transfer bags exceed available bags for receipt \${targetInward.receiptNumber}.\` };
    }
    
    validatedSources.push({
      source,
      targetInward
    });
  }

  const batchId = new mongoose.Types.ObjectId().toString();
  const createdTransferIds: string[] = [];
  
  // Create all transfers atomically
  const mongooseSession = await mongoose.startSession();
  
  try {
    await mongooseSession.withTransaction(async () => {
      for (const { source, targetInward } of validatedSources) {
        let remainingWeight = source.transferWeight;
        let remainingBags = source.transferBags;

        // 1. Distribute across available allocations
        const transferAllocations = [];
        
        for (const alloc of targetInward.availableAllocations) {
          if (remainingWeight <= 0 && remainingBags <= 0) break;
          
          const takeWeight = Math.min(alloc.allocatedWeight, remainingWeight);
          const takeBags = Math.min(alloc.bagsCount, remainingBags);
          
          if (takeWeight > 0 || takeBags > 0) {
            transferAllocations.push({
              chamberName: alloc.chamberName,
              chamberNo: alloc.chamberNo,
              floorNo: alloc.floorNo,
              stackNo: alloc.stackNo,
              allocatedWeight: takeWeight,
              bagsCount: takeBags,
              grade: targetInward.grade,
              gradingType: targetInward.gradingType,
              stockType: transferType
            });
            
            remainingWeight -= takeWeight;
            remainingBags -= takeBags;
          }
        }

        if (transferType === 'Purchase') {
          const originalInward = await ColdInward.findById(targetInward._id).session(mongooseSession);
          if (!originalInward) throw new Error("Original inward not found");

          for (const item of transferAllocations) {
            const selfAlloc = originalInward.stackAllocations.find((a: any) => 
              (a.chamberName === item.chamberName || (a.chamberNo && a.chamberNo === item.chamberNo)) && 
              a.floorNo === item.floorNo && 
              a.stackNo === item.stackNo &&
              (a.stockType === 'Self' || !a.stockType)
            );

            if (selfAlloc) {
              selfAlloc.allocatedWeight -= item.allocatedWeight;
              if (selfAlloc.bagsCount) selfAlloc.bagsCount -= item.bagsCount;
              if (selfAlloc.allocatedWeight < 0) selfAlloc.allocatedWeight = 0;
              if (selfAlloc.bagsCount && selfAlloc.bagsCount < 0) selfAlloc.bagsCount = 0;
            }

            originalInward.stackAllocations.push({
              chamberName: item.chamberName,
              chamberNo: item.chamberNo,
              floorNo: item.floorNo,
              stackNo: item.stackNo,
              allocatedWeight: item.allocatedWeight,
              bagsCount: item.bagsCount,
              stockType: 'Purchase'
            });
          }

          const hasSelf = originalInward.stackAllocations.some((a: any) => a.allocatedWeight > 0 && (a.stockType === 'Self' || !a.stockType));
          const hasPurchase = originalInward.stackAllocations.some((a: any) => a.allocatedWeight > 0 && a.stockType === 'Purchase');
          
          if (hasSelf && hasPurchase) {
            originalInward.stockType = 'Both';
          } else if (hasPurchase) {
            originalInward.stockType = 'Purchase';
          } else {
            originalInward.stockType = 'Self';
          }

          await originalInward.save({ session: mongooseSession });

          const transferData = {
            fromClientId: source.fromClientId,
            toClientId: toClientId || targetInward.warehouseId._id,
            toClientModel: 'ColdWarehouse',
            originalInwardId: targetInward._id,
            newInwardId: targetInward._id, 
            warehouseId: targetInward.warehouseId._id,
            commodityId: targetInward.commodityId._id,
            stackAllocations: transferAllocations,
            quantityKg: source.transferWeight,
            bagsCount: source.transferBags,
            transferType: transferType,
            date: transferDateObj,
            batchId
          };

          const transfer = (await ColdTransfer.create([appendOwnership(transferData, session)], { session: mongooseSession }))[0];
          createdTransferIds.push(transfer._id.toString());

          await logColdActivity({
            actionType: 'CREATE',
            module: 'Ownership Transfer',
            recordId: transfer._id.toString(),
            description: \`Ownership transferred (Purchase): \${source.transferWeight} Kg (Batch: \${batchId})\`,
            newValue: JSON.parse(JSON.stringify(transfer)),
            sessionFallback: session
          });
        } else {
          // Self transfer
          const newInwardData = {
            clientId: toClientId,
            commodityId: targetInward.commodityId._id,
            warehouseId: targetInward.warehouseId._id,
            stackAllocations: transferAllocations,
            quantityKg: source.transferWeight,
            bagsCount: source.transferBags,
            grade: targetInward.grade,
            gradingType: targetInward.gradingType,
            stockType: transferType,
            seed: targetInward.seed,
            tableLabel: targetInward.tableLabel,
            date: transferDateObj,
            remarks: 'Ownership Transfer In',
            weighbridgeSlipNo: targetInward.weighbridgeSlipNo,
            marko: targetInward.marko,
          };

          const newInward = (await ColdInward.create([appendOwnership(newInwardData, session)], { session: mongooseSession }))[0];

          const transferData = {
            fromClientId: source.fromClientId,
            toClientId: toClientId,
            originalInwardId: targetInward._id,
            newInwardId: newInward._id,
            warehouseId: targetInward.warehouseId._id,
            commodityId: targetInward.commodityId._id,
            stackAllocations: transferAllocations,
            quantityKg: source.transferWeight,
            bagsCount: source.transferBags,
            transferType: transferType,
            date: transferDateObj,
            batchId
          };

          const transfer = (await ColdTransfer.create([appendOwnership(transferData, session)], { session: mongooseSession }))[0];
          createdTransferIds.push(transfer._id.toString());

          await logColdActivity({
            actionType: 'CREATE',
            module: 'Ownership Transfer',
            recordId: transfer._id.toString(),
            description: \`Ownership transferred: \${source.transferWeight} Kg to new receipt \${newInward.receiptNumber} (Batch: \${batchId})\`,
            newValue: JSON.parse(JSON.stringify(transfer)),
            sessionFallback: session
          });
        }
      }
    });
  } finally {
    await mongooseSession.endSession();
  }

  revalidatePath('/cold/dashboard');
  revalidatePath('/cold/transfers');
  revalidatePath('/cold/inward');
  revalidatePath('/cold/outward');

  return { success: true, transferId: batchId };
}`;

const startIndex = content.indexOf('export async function createOwnershipTransfer');
const endIndex = content.indexOf('export async function getColdTransfers');
if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newFuncStr + '\n\n' + content.substring(endIndex);
  fs.writeFileSync(file, content);
  console.log("Patched successfully");
} else {
  console.log("Could not find boundaries");
}
