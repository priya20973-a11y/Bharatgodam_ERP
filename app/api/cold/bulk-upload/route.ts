import { NextRequest, NextResponse } from 'next/server';
import { createColdInwardBulk } from '@/app/actions/cold-inward-actions';
import Client from '@/lib/models/Client';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import ColdInward from '@/lib/models/ColdInward';
import connectToDatabase from '@/lib/mongoose';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';
import { logActivity } from '@/lib/cold-logger';

interface BulkColdInwardRow {
  type: string;
  clientName: string;
  commodityName: string;
  variety: string;
  warehouseName: string;
  date: string;
  truckNo: string;
  weighbridgeSlipNo: string;
  seed: string;
  tableLabel: string;
  marko: string;
  farmerName: string;
  villageName: string;
  lotNo: string;
  referencePersonName: string;
  grossWeight: string;
  emptyWeight: string;
  selfPurchase: string;
  largeBag: string;
  smallBag: string;
  totalBags: string;
  netWeight: string;
  chamberNo: string;
  floorNo: string;
  stackNo: string;
  allocatedWeight: string;
  allocatedBagsCount: string;
  grading: string;
  remarks: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function buildLookupMap(items: any[]) {
  const map = new Map<string, any>();
  items.forEach((item) => {
    const names = new Set<string>();
    const rawName = item?.name ? item.name.toString().trim() : '';
    if (rawName) {
      names.add(rawName.toLowerCase());
      names.add(normalizeName(rawName));
      if (item.displayName) {
        const displayName = item.displayName.toString().trim();
        if (displayName) {
          names.add(displayName.toLowerCase());
          names.add(normalizeName(displayName));
        }
      }
    }

    names.forEach((nameKey) => {
      if (nameKey) map.set(nameKey, item._id);
    });
  });
  return map;
}

function findMasterByName(name: string, map: Map<string, any>, items: any[]): any {
  const trimmedName = (name || '').trim();
  const normalizedName = normalizeName(trimmedName);
  if (!trimmedName) return undefined;

  const directMatch = map.get(trimmedName.toLowerCase()) || map.get(normalizedName);
  if (directMatch) return directMatch;

  const fuzzyMatch = items.find((item) => {
    if (!item?.name) return false;

    const names = [item.name?.toString?.() || '', item.displayName?.toString?.() || ''];
    return names.some((candidateName) => {
      const candidate = normalizeName(candidateName);
      if (!candidate) return false;
      return candidate === normalizedName || candidate.includes(normalizedName) || normalizedName.includes(candidate);
    });
  });

  return fuzzyMatch?._id;
}

function parseDate(dateStr: string): Date | null {
  const normalized = dateStr?.trim();
  if (!normalized) return null;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

async function parseCSV(text: string): Promise<BulkColdInwardRow[]> {
  const lines = text.trim().split(/\r\n|\n|\r/);
  if (lines.length < 2) {
    throw new Error('CSV file must contain header and at least one data row');
  }

  const headerLine = lines[0];
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';
  else if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';

  const headers = headerLine.split(delimiter).map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const requiredHeaders = ['type', 'clientname', 'commodityname', 'variety', 'warehousename', 'date', 'truckno', 'weighbridgeslipno', 'seed', 'tablelabel', 'marko', 'farmername', 'villagename', 'referencepersonname', 'grossweight', 'emptyweight', 'selfpurchase', 'largebag', 'smallbag', 'totalbags', 'netweight', 'chamberno', 'floorno', 'stackno', 'allocatedweight', 'allocatedbagscount'];
  
  // Make some headers optional if they are not strictly required for the system to function
  // But since we are not modifying existing functionality, we'll keep checking them
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
  }

  const rows: BulkColdInwardRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(delimiter).map((v) => v.trim());
    const row: any = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    const typeValue = (row.type || '').trim().toUpperCase().replace(/\s+/g, '');
    if (typeValue && typeValue !== 'INWARD') {
      continue;
    }

    rows.push({
      type: typeValue || 'INWARD',
      clientName: (row.clientname || '').trim(),
      commodityName: (row.commodityname || '').trim(),
      variety: (row.variety || '').trim(),
      warehouseName: (row.warehousename || '').trim(),
      date: (row.date || '').trim(),
      truckNo: (row.truckno || '').trim(),
      weighbridgeSlipNo: (row.weighbridgeslipno || '').trim(),
      seed: (row.seed || '').trim(),
      tableLabel: (row.tablelabel || row.table || '').trim(),
      marko: (row.marko || '').trim(),
      farmerName: (row.farmername || '').trim(),
      villageName: (row.villagename || '').trim(),
      lotNo: (row.lotno || row.lot_no || row.lot || '').trim(),
      referencePersonName: (row.referencepersonname || row.referenceperson || '').trim(),
      grossWeight: (row.grossweight || row.gross_weight || '').trim(),
      emptyWeight: (row.emptyweight || row.empty_weight || '').trim(),
      selfPurchase: (row.selfpurchase || row.self_purchase || row.purchasetype || row.purchasemode || '').trim(),
      largeBag: (row.largebag || row.large_bag || '').trim(),
      smallBag: (row.smallbag || row.small_bag || '').trim(),
      totalBags: (row.totalbags || row.total_bags || row.bagstotal || '').trim(),
      netWeight: (row.netweight || row.net_weight || row.quantitykg || '').trim(),
      chamberNo: (row.chamberno || '').trim(),
      floorNo: (row.floorno || '').trim(),
      stackNo: (row.stackno || '').trim(),
      allocatedWeight: (row.allocatedweight || row.quantitykg || '0').trim(),
      allocatedBagsCount: (row.allocatedbagscount || row.bagscount || row.bagscount || '0').trim(),
      grading: (row.grading || row.gradingflag || row.gradingtype || '').trim(),
      remarks: (row.remarks || '').trim(),
    });
  }

  return rows;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();
    const tenantFilter = getTenantFilterForMongo(session) || {};

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({
        success: false,
        totalRows: 0,
        successCount: 0,
        errorCount: 1,
        errors: [{ row: 0, error: 'No file provided' }],
        error: 'No file provided',
      }, { status: 400 });
    }

    const text = await file.text();
    const rows = await parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        totalRows: 0,
        successCount: 0,
        errorCount: 1,
        errors: [{ row: 0, error: 'No valid INWARD rows found in CSV' }],
        error: 'No valid INWARD rows found in CSV',
      }, { status: 400 });
    }

    const clients = await Client.find(tenantFilter).lean();
    const commodities = await ColdCommodity.find(tenantFilter).lean();
    const warehouses = await ColdWarehouse.find(tenantFilter).lean();

    console.log('[cold bulk upload debug]', {
      userId: session?.user?.id,
      email: session?.user?.email,
      role: session?.user?.role,
      companyName: (session?.user as any)?.companyName,
      wspCount: warehouses.length,
      warehouseNames: warehouses.map((w: any) => w.name),
    });

    const clientMap = buildLookupMap(clients);
    const commodityMap = buildLookupMap(commodities);
    const warehouseMap = buildLookupMap(warehouses);

    const errors: Array<{ row: number; error: string }> = [];
    const warnings: string[] = [];
    let successCount = 0;
    const groupedReceipts = new Map<string, any>();
    const processedRowIds = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];

      try {
        if (!row.variety) {
          throw new Error('Variety is required.');
        }

        const clientId = findMasterByName(row.clientName, clientMap, clients);
        
        let commodityId = undefined;
        if (row.commodityName && row.variety) {
          const normalizedCommodityName = normalizeName(row.commodityName);
          const normalizedVariety = normalizeName(row.variety);
          
          const matchedCommodity = commodities.find((c: any) => {
             return normalizeName(c.name) === normalizedCommodityName && normalizeName(c.type) === normalizedVariety;
          });
          if (matchedCommodity) {
             commodityId = matchedCommodity._id;
          }
        }

        let warehouseId = findMasterByName(row.warehouseName, warehouseMap, warehouses);

        if (!warehouseId) {
          const fallbackWarehouse = await ColdWarehouse.findOne({
            name: { $regex: new RegExp(`^${escapeRegExp((row.warehouseName || '').trim())}$`, 'i') }
          }).lean();
          if (fallbackWarehouse) {
            warehouseId = fallbackWarehouse._id;
          }
        }

        if (!clientId) {
          throw new Error(`Client "${row.clientName}" not found`);
        }
        if (!commodityId) {
          throw new Error(`Commodity "${row.commodityName}" with Variety "${row.variety}" not found`);
        }

        const client = clients.find((c: any) => c._id.toString() === clientId?.toString());
        if (client && client.commodityIds && client.commodityIds.length > 0) {
           const hasAccess = client.commodityIds.some((id: any) => id.toString() === commodityId.toString());
           if (!hasAccess) {
             throw new Error(`Variety ${row.variety} is not assigned to this client.`);
           }
        }

        if (!warehouseId) {
          const availableWarehouses = warehouses
            .slice(0, 10)
            .map((warehouse: any) => warehouse.name)
            .join(', ');
          const debugMsg = `Warehouse "${row.warehouseName}" not found in current WSP. Session userId=${session?.user?.id}; role=${session?.user?.role}; companyName=${(session?.user as any)?.companyName || 'N/A'}; loadedWarehouseNames=${warehouses.map((w: any) => w.name).join(' | ') || 'none'}`;
          console.error('[cold bulk upload debug]', debugMsg);
          throw new Error(
            `Warehouse "${row.warehouseName}" not found in current WSP. Available warehouses: ${availableWarehouses || 'none'}`
          );
        }

        const rawChamber = (row.chamberNo || '').trim();
        const rawFloor = (row.floorNo || '').trim();
        const rawStack = (row.stackNo || '').trim();
        
        const chamberNo = Number(rawChamber);
        const floorNo = Number(rawFloor);
        const stackNo = Number(rawStack);
        const allocatedWeight = Number(row.allocatedWeight);
        const bagsCount = Number(row.allocatedBagsCount || 0);
        
        const warehouse = warehouses.find((w: any) => w._id.toString() === warehouseId.toString());

        let finalChamberNo: any = chamberNo;
        let finalChamberName = rawChamber;
        if (Number.isNaN(chamberNo) || chamberNo <= 0) {
          const isCustomChamber = warehouse?.chambers?.some((c: any) => 
            c.name && c.name.toString().trim().toLowerCase() === rawChamber.toLowerCase()
          );
          if (!isCustomChamber) {
            throw new Error('ChamberNo must be a positive number or a valid custom chamber name');
          }
          finalChamberNo = rawChamber; // pass string
        }

        let finalFloorNo: any = floorNo;
        let finalFloorName = rawFloor;
        if (Number.isNaN(floorNo) || floorNo <= 0) {
          const isCustomFloor = warehouse?.chambers?.some((c: any) => 
            c.floors?.some((f: any) => f.name && f.name.toString().trim().toLowerCase() === rawFloor.toLowerCase())
          );
          if (!isCustomFloor) {
            throw new Error('FloorNo must be a positive number or a valid custom floor name');
          }
          finalFloorNo = rawFloor; // pass string
        }

        let finalStackNo: any = stackNo;
        let finalStackName = rawStack;
        if (Number.isNaN(stackNo) || stackNo <= 0) {
          const isCustomStack = warehouse?.chambers?.some((c: any) => 
            c.floors?.some((f: any) => f.stacks?.some((s: any) => s.name && s.name.toString().trim().toLowerCase() === rawStack.toLowerCase()))
          );
          if (!isCustomStack) {
            throw new Error('StackNo must be a positive number or a valid custom stack name');
          }
          finalStackNo = rawStack; // pass string
        }
        if (!Number.isFinite(allocatedWeight) || allocatedWeight <= 0) {
          throw new Error('AllocatedWeight must be greater than zero');
        }

        const date = parseDate(row.date);
        if (!date) {
          throw new Error('Date must be in YYYY-MM-DD format');
        }

        const normalizedGradingFlag = (row.grading || '').trim().toUpperCase();
        const gradingType = normalizedGradingFlag === 'Y' || normalizedGradingFlag === 'YES' || normalizedGradingFlag === 'TRUE' ? 'Grading' : '';
        const normalizedPurchaseValue = (row.selfPurchase || '').trim().toLowerCase();
        const stockType = normalizedPurchaseValue === 'purchase' || normalizedPurchaseValue === 'p' ? 'Purchase' : normalizedPurchaseValue === 'self' || normalizedPurchaseValue === 's' ? 'Self' : 'Self';
        const largeBag = Number(row.largeBag || 0);
        const smallBag = Number(row.smallBag || 0);
        const grossWeight = Number(row.grossWeight || allocatedWeight || 0);
        const emptyWeight = Number(row.emptyWeight || 0);
        const totalBags = Number(row.totalBags || 0);
        const netWeight = Number(row.netWeight || (grossWeight - emptyWeight) || allocatedWeight || 0);
        const dateKey = date.toISOString().slice(0, 10);
        const receiptKey = [
          clientId.toString(),
          commodityId.toString(),
          warehouseId.toString(),
          dateKey,
          (row.truckNo || '').trim(),
          (row.weighbridgeSlipNo || '').trim(),
        ].join('|');

        const rowId = `bulkinw|${receiptKey}|${finalChamberNo}|${finalFloorNo}|${finalStackNo}`;

        if (processedRowIds.has(rowId)) {
          warnings.push(`Row ${rowNum}: Duplicate row within upload - skipped`);
          continue;
        }

        const isDbDuplicate = await ColdInward.exists({ 'stackAllocations.rowId': rowId });
        if (isDbDuplicate) {
          warnings.push(`Row ${rowNum}: Duplicate row already exists in database - skipped`);
          continue;
        }

        processedRowIds.add(rowId);

        if (!groupedReceipts.has(receiptKey)) {
          groupedReceipts.set(receiptKey, {
            rowNums: [],
            warehouseId: warehouseId.toString(),
            common: {
              date: dateKey,
              warehouseId: warehouseId.toString(),
              remarks: row.remarks || '',
              truckNo: row.truckNo || '',
              weighbridgeSlipNo: row.weighbridgeSlipNo || '',
              seed: row.seed || '',
              tableLabel: row.tableLabel || '',
              grossWeight,
              emptyWeight,
              totalBags,
              netWeight,
              stockType,
              sameCommodity: true,
              commodityId: commodityId.toString(),
            },
            clients: [{
              clientId: clientId.toString(),
              commodityId: commodityId.toString(),
              grade: row.grading ? 'Large' : '',
              gradingType,
              seed: row.seed || '',
              tableLabel: row.tableLabel || '',
              marko: row.marko || '',
              farmerName: row.farmerName || '',
              villageName: row.villageName || '',
              lotNo: row.lotNo || '',
              grossWeight,
              emptyWeight,
              largeBag,
              smallBag,
              totalBags,
              netWeight,
              stockType,
              stacks: [],
              qualityReadings: [],
              referencePersons: row.referencePersonName ? [{ name: row.referencePersonName }] : [],
            }],
          });
        }

        const groupedReceipt = groupedReceipts.get(receiptKey);
        groupedReceipt.rowNums.push(rowNum);
        groupedReceipt.clients[0].stacks.push({
          chamberNo: finalChamberNo,
          chamberName: finalChamberName,
          floorNo: finalFloorNo,
          floorName: finalFloorName,
          stackNo: finalStackNo,
          stackName: finalStackName,
          allocatedWeight,
          allocatedBags: bagsCount,
          stockType,
          rowId,
        });

        if (row.referencePersonName) {
          const existingRefNames = new Set((groupedReceipt.clients[0].referencePersons || []).map((person: any) => person.name?.trim().toLowerCase()));
          if (!existingRefNames.has(row.referencePersonName.trim().toLowerCase())) {
            groupedReceipt.clients[0].referencePersons.push({ name: row.referencePersonName.trim() });
          }
        }
      } catch (error: any) {
        errors.push({ row: rowNum, error: error.message || 'Unknown validation error' });
      }
    }

    for (const groupedReceipt of groupedReceipts.values()) {
      const result = await createColdInwardBulk(groupedReceipt);
      if (!result?.success) {
        errors.push({ 
          row: groupedReceipt.rowNums && groupedReceipt.rowNums.length > 0 ? groupedReceipt.rowNums[0] : 0, 
          error: result?.error || 'Failed to create inward transaction' 
        });
        continue;
      }
      if (result?.warning) {
        warnings.push(result.warning);
      }
      successCount += 1;
    }

    if (successCount > 0) {
      await logActivity({
        actionType: 'CREATE',
        module: 'Bulk Upload',
        description: `Bulk uploaded ${successCount} inward transaction(s)`,
        storageType: 'Cold Storage',
        sessionFallback: session
      });
    }

    return NextResponse.json({
      success: successCount > 0 && errors.length === 0,
      totalRows: rows.length,
      successCount,
      errorCount: errors.length,
      errors,
      warnings,
    });
  } catch (error: any) {
    console.error('[Cold Bulk Upload] Failed:', error);
    return NextResponse.json({
      success: false,
      totalRows: 0,
      successCount: 0,
      errorCount: 1,
      errors: [{ row: 0, error: error.message || 'Failed to process cold bulk upload' }],
      error: error.message || 'Failed to process cold bulk upload',
    }, { status: 500 });
  }
}
