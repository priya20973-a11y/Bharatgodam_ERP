import { NextRequest, NextResponse } from 'next/server';
import { createColdInwardBulk } from '@/app/actions/cold-inward-actions';
import Client from '@/lib/models/Client';
import ColdCommodity from '@/lib/models/ColdCommodity';
import ColdWarehouse from '@/lib/models/ColdWarehouse';
import connectToDatabase from '@/lib/mongoose';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';

interface BulkColdInwardRow {
  type: string;
  clientName: string;
  commodityName: string;
  warehouseName: string;
  date: string;
  truckNo: string;
  weighbridgeSlipNo: string;
  seed: string;
  tableLabel: string;
  marko: string;
  farmerName: string;
  referencePersonName: string;
  grossWeight: string;
  emptyWeight: string;
  selfPurchase: string;
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
  const lines = text.trim().replace(/\r/g, '').split('\n');
  if (lines.length < 2) {
    throw new Error('CSV file must contain header and at least one data row');
  }

  const headerLine = lines[0];
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const delimiter = tabCount > commaCount ? '\t' : ',';

  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase());
  const requiredHeaders = ['type', 'clientname', 'commodityname', 'warehousename', 'date', 'truckno', 'weighbridgeslipno', 'seed', 'tablelabel', 'marko', 'farmername', 'referencepersonname', 'grossweight', 'emptyweight', 'selfpurchase', 'totalbags', 'netweight', 'chamberno', 'floorno', 'stackno', 'allocatedweight', 'allocatedbagscount'];
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
      warehouseName: (row.warehousename || '').trim(),
      date: (row.date || '').trim(),
      truckNo: (row.truckno || '').trim(),
      weighbridgeSlipNo: (row.weighbridgeslipno || '').trim(),
      seed: (row.seed || '').trim(),
      tableLabel: (row.tablelabel || row.table || '').trim(),
      marko: (row.marko || '').trim(),
      farmerName: (row.farmername || '').trim(),
      referencePersonName: (row.referencepersonname || row.referenceperson || '').trim(),
      grossWeight: (row.grossweight || row.gross_weight || '').trim(),
      emptyWeight: (row.emptyweight || row.empty_weight || '').trim(),
      selfPurchase: (row.selfpurchase || row.self_purchase || row.purchasetype || row.purchasemode || '').trim(),
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
    let successCount = 0;
    const groupedReceipts = new Map<string, any>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const row = rows[i];

      try {
        const clientId = findMasterByName(row.clientName, clientMap, clients);
        const commodityId = findMasterByName(row.commodityName, commodityMap, commodities);
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
          throw new Error(`Commodity "${row.commodityName}" not found`);
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

        const chamberNo = Number(row.chamberNo);
        const floorNo = Number(row.floorNo);
        const stackNo = Number(row.stackNo);
        const allocatedWeight = Number(row.allocatedWeight);
        const bagsCount = Number(row.allocatedBagsCount || 0);

        if (Number.isNaN(chamberNo) || chamberNo <= 0) {
          throw new Error('ChamberNo must be a positive number');
        }
        if (Number.isNaN(floorNo) || floorNo <= 0) {
          throw new Error('FloorNo must be a positive number');
        }
        if (Number.isNaN(stackNo) || stackNo <= 0) {
          throw new Error('StackNo must be a positive number');
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
        const purchaseType = normalizedPurchaseValue === 'purchase' || normalizedPurchaseValue === 'p' ? 'purchase' : normalizedPurchaseValue === 'self' || normalizedPurchaseValue === 's' ? 'self' : 'self';
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

        if (!groupedReceipts.has(receiptKey)) {
          groupedReceipts.set(receiptKey, {
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
              purchaseType,
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
              grossWeight,
              emptyWeight,
              totalBags,
              netWeight,
              purchaseType,
              stacks: [],
              qualityReadings: [],
              referencePersons: row.referencePersonName ? [{ name: row.referencePersonName }] : [],
            }],
          });
        }

        const groupedReceipt = groupedReceipts.get(receiptKey);
        groupedReceipt.clients[0].stacks.push({
          chamberNo,
          floorNo,
          stackNo,
          allocatedWeight,
          allocatedBags: bagsCount,
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
        throw new Error(result?.error || 'Failed to create inward transaction');
      }
      successCount += 1;
    }

    return NextResponse.json({
      success: successCount > 0 && errors.length === 0,
      totalRows: rows.length,
      successCount,
      errorCount: errors.length,
      errors,
      warnings: [],
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
