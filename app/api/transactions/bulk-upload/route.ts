import { NextRequest, NextResponse } from 'next/server';
import { requireSession, appendOwnershipForMongo, getTenantFilterForMongo } from '@/lib/ownership';
import connectToDatabase from '@/lib/mongoose';
import { getDb } from '@/lib/mongodb';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import Client from '@/lib/models/Client';
import Commodity from '@/lib/models/Commodity';
import Warehouse from '@/lib/models/Warehouse';
import { createStockEntry, generateMonthlyInvoices } from '@/app/actions/stock-ledger-actions';
import { generateTimeStateLedger } from '@/lib/ledger-time-state-engine';
import { validateOutwardStock } from '@/app/actions/transaction-actions';
import mongoose from 'mongoose';
import { logActivity } from '@/lib/cold-logger';

interface BulkTransactionRow {
  type: 'INWARD' | 'OUTWARD';
  clientName: string;
  commodityName: string;
  warehouseName: string;
  quantityMT: number;
  bagsCount: number;
  stackNo?: string;
  lotNo?: string;
  gatePass?: string;
  date: string; // YYYY-MM-DD
}

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function buildLookupMap(items: any[]) {
  const map = new Map<string, any>();
  items.forEach((item) => {
    if (!item?.name) return;
    const rawName = item.name.toString().trim();
    const normalizedName = normalizeName(rawName);

    if (rawName) {
      map.set(rawName.toLowerCase(), item._id);
    }
    if (normalizedName) {
      map.set(normalizedName, item._id);
    }
  });
  return map;
}

function findMasterByName(name: string, map: Map<string, any>, items: any[]): any {
  const trimmedName = name.trim();
  const normalizedName = normalizeName(trimmedName);
  if (!trimmedName) return undefined;

  const directMatch = map.get(trimmedName.toLowerCase()) || map.get(normalizedName);
  if (directMatch) return directMatch;

  const fuzzyMatch = items.find((item) => {
    if (!item?.name) return false;
    const candidate = normalizeName(item.name.toString());
    return candidate === normalizedName || candidate.includes(normalizedName) || normalizedName.includes(candidate);
  });

  return fuzzyMatch?._id;
}

interface ProcessResult {
  success: boolean;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; error: string }>;
  warnings?: string[];
}

async function parseCSV(text: string): Promise<BulkTransactionRow[]> {
  const lines = text.trim().split(/\r\n|\n|\r/);
  if (lines.length < 2) {
    throw new Error('CSV file must contain header and at least one data row');
  }

  // Detect delimiter - check if header contains tabs or commas
  // Count tabs and commas in the first line
  const headerLine = lines[0];
  const tabCount = (headerLine.match(/\t/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  
  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';
  else if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';

  const headers = headerLine
    .split(delimiter)
    .map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

  const requiredHeaders = ['type', 'clientname', 'commodityname', 'warehousename', 'quantitymt', 'bagscount', 'date'];
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
  }

  const rows: BulkTransactionRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(delimiter).map((v) => v.trim());
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    // Extract and clean type value - trim whitespace and remove any extra spaces
    const rawType = (row.type || '').trim();
    const typeValue = rawType.toUpperCase().replace(/\s+/g, '');
    
    // Skip rows with invalid type
    if (typeValue !== 'INWARD' && typeValue !== 'OUTWARD') {
      continue; // Skip invalid rows
    }
    
    rows.push({
      type: typeValue as 'INWARD' | 'OUTWARD',
      clientName: (row.clientname || '').trim(),
      commodityName: (row.commodityname || '').trim(),
      warehouseName: (row.warehousename || '').trim(),
      quantityMT: parseFloat((row.quantitymt || '0').toString()) || 0,
      bagsCount: parseFloat((row.bagscount || '0').toString()) || 0,
      stackNo: (row.stackno || '').trim(),
      lotNo: (row.lotno || '').trim(),
      gatePass: (row.gatepass || '').trim(),
      date: (row.date || '').trim(),
    });
  }

  console.log(`[CSV Parse] Found ${rows.length} valid transaction rows`);
  return rows;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const normalized = dateStr.trim();
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

function formatDateToISO(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    await connectToDatabase();
    const db = await getDb();
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

    const fileText = await file.text();
    console.log(`[Bulk Upload] Processing file: ${file.name}`);
    const rows = await parseCSV(fileText);
    console.log(`[Bulk Upload] Parsed ${rows.length} rows from CSV`);

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        totalRows: 0,
        successCount: 0,
        errorCount: 1,
        errors: [{ row: 0, error: 'No data rows found in CSV' }],
        error: 'No data rows found in CSV',
      }, { status: 400 });
    }

    // Get all clients, commodities, and warehouses for mapping
    const clients = await Client.find(tenantFilter).lean();
    const commodities = await Commodity.find({}).lean();
    const warehouses = await Warehouse.find(tenantFilter).lean();

    const clientMap = buildLookupMap(clients);
    const commodityMap = buildLookupMap(commodities);
    const commodityDocMap = new Map<string, any>();
    const warehouseMap = buildLookupMap(warehouses);

    const warehouseCapacityMap = new Map<string, { total: number, occupied: number }>();
    warehouses.forEach((w: any) => {
      if (w._id) {
        warehouseCapacityMap.set(w._id.toString(), {
          total: Number(w.totalCapacity) || 0,
          occupied: Number(w.occupiedCapacity) || 0
        });
      }
    });

    commodities.forEach((c: any) => {
      if (c._id) {
        commodityDocMap.set(c._id.toString(), c);
      }
    });

    const errors: Array<{ row: number; error: string }> = [];
    const warnings: string[] = [];
    let successCount = 0;
    const processedTransactions = new Set<string>(); // Track processed transactions to prevent duplicates within same upload
    const invoiceMonths = new Set<string>();

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // +2 because of header and 1-based indexing
      const row = rows[i];
      
      console.log(`[Bulk Upload] Processing row ${rowNum}: ${row.type} - ${row.clientName} - ${row.commodityName} - ${row.warehouseName} - ${row.quantityMT}MT - ${row.date}`);

      try {
        // Validate required fields
        if (!row.type || (row.type !== 'INWARD' && row.type !== 'OUTWARD')) {
          errors.push({ row: rowNum, error: `Invalid type "${row.type}". Must be INWARD or OUTWARD` });
          continue;
        }

        if (!row.clientName) {
          errors.push({ row: rowNum, error: 'Client name is required' });
          continue;
        }

        if (!row.commodityName) {
          errors.push({ row: rowNum, error: 'Commodity name is required' });
          continue;
        }

        if (!row.warehouseName) {
          errors.push({ row: rowNum, error: 'Warehouse name is required' });
          continue;
        }

        if (!row.date) {
          errors.push({ row: rowNum, error: 'Date is required' });
          continue;
        }

        if (row.quantityMT <= 0) {
          errors.push({ row: rowNum, error: 'Quantity MT must be greater than 0' });
          continue;
        }

        const transactionDate = parseDate(row.date);
        if (!transactionDate) {
          errors.push({ row: rowNum, error: `Invalid date format: ${row.date}. Use YYYY-MM-DD` });
          continue;
        }

        // Map master data
        const clientId = findMasterByName(row.clientName, clientMap, clients);
        const commodityId = findMasterByName(row.commodityName, commodityMap, commodities);
        const warehouseId = findMasterByName(row.warehouseName, warehouseMap, warehouses);

        if (!clientId) {
          errors.push({ row: rowNum, error: `Client does not exist under this WSP account.` });
          continue;
        }

        if (!commodityId) {
          errors.push({ row: rowNum, error: `Commodity '${row.commodityName}' not found` });
          continue;
        }

        if (!warehouseId) {
          errors.push({ row: rowNum, error: `Warehouse '${row.warehouseName}' not found` });
          continue;
        }

        const client = clients.find((item: any) => item._id?.toString() === clientId.toString());
        const commodity = commodities.find((item: any) => item._id?.toString() === commodityId.toString());
        const warehouse = warehouses.find((item: any) => item._id?.toString() === warehouseId.toString());

        // Validate that the commodity is assigned to the selected client
        if (client) {
          const assignedCommodities = client.commodityIds || [];
          const isAssigned = assignedCommodities.some((id: any) => id.toString() === commodityId.toString());
          if (!isAssigned) {
            errors.push({ row: rowNum, error: `Commodity '${row.commodityName}' is not assigned to client '${client.name}'. Please assign it first.` });
            continue;
          }
        }

        const clientName = client?.name || row.clientName;
        const commodityName = commodity?.name || row.commodityName;
        const warehouseName = warehouse?.name || row.warehouseName;

        const clientIdStr = clientId.toString();
        const commodityIdStr = commodityId.toString();
        const warehouseIdStr = warehouseId.toString();

        // Create unique key for this row to prevent duplicates within the same upload
        const transactionKey = `${row.type}|${clientIdStr}|${commodityIdStr}|${warehouseIdStr}|${row.quantityMT}|${formatDateToISO(transactionDate)}`;
        
        if (processedTransactions.has(transactionKey)) {
          console.log(`[Bulk Upload] Row ${rowNum}: Duplicate within upload - skipping`);
          warnings.push(`Row ${rowNum}: Duplicate row in this upload - skipped`);
          continue;
        }
        
        processedTransactions.add(transactionKey);
        
        // Check for duplicate transactions in database (same client, commodity, warehouse, type, quantity, date)
        const existingTransaction = await db.collection('transactions').findOne({
          clientId: clientIdStr,
          commodityId: commodityIdStr,
          warehouseId: warehouseIdStr,
          direction: row.type,
          quantityMT: row.quantityMT,
          date: formatDateToISO(transactionDate),
          ...(tenantFilter || {})
        });

        if (existingTransaction) {
          console.log(`[Bulk Upload] Row ${rowNum}: Duplicate in database - skipping`);
          warnings.push(`Row ${rowNum}: Duplicate transaction already exists in database`);
          continue;
        }
        
        console.log(`[Bulk Upload] Row ${rowNum}: No duplicates found, proceeding with creation`);

        // Create transaction based on type
        if (row.type === 'INWARD') {
          // Check capacity
          const wData = warehouseCapacityMap.get(warehouseIdStr);
          if (wData) {
            const availableCapacity = Math.max(0, wData.total - wData.occupied);
            if (row.quantityMT > availableCapacity) {
              errors.push({ row: rowNum, error: `Insufficient warehouse capacity. Available capacity: ${availableCapacity} MT.` });
              continue;
            }
            // Update tracking map
            wData.occupied += row.quantityMT;
          }

          console.log(`[Bulk Upload] Row ${rowNum}: Creating Inward model...`);
          const inwardRecord = await Inward.create({
            clientId,
            commodityId,
            warehouseId,
            quantityMT: row.quantityMT,
            bagsCount: row.bagsCount,
            stackNo: row.stackNo,
            lotNo: row.lotNo,
            gatePass: row.gatePass,
            date: transactionDate,
            userId: session.user?.id ? new mongoose.Types.ObjectId(session.user.id) : undefined,
            userEmail: session.user?.email,
          });
          console.log(`[Bulk Upload] Row ${rowNum}: Inward model created with ID: ${inwardRecord._id}`);

          // Also create transaction record for display in reports
          console.log(`[Bulk Upload] Row ${rowNum}: Creating transaction record...`);
          const transactionData = appendOwnershipForMongo({
            direction: 'INWARD',
            clientId: clientIdStr,
            commodityId: commodityIdStr,
            warehouseId: warehouseIdStr,
            quantityMT: row.quantityMT,
            bagsCount: row.bagsCount,
            stackNo: row.stackNo,
            lotNo: row.lotNo,
            gatePass: row.gatePass,
            clientName,
            commodityName,
            warehouseName,
            date: formatDateToISO(transactionDate),
            accountId: clientIdStr,
            userId: session.user?.id ? new mongoose.Types.ObjectId(session.user.id) : undefined,
            userEmail: session.user?.email,
            source: 'BULK_UPLOAD',
            createdAt: new Date(),
          }, session);
          
          // Verify this transaction doesn't already exist with exact match
          const existingTxn = await db.collection('transactions').findOne({
            direction: 'INWARD',
            clientId: clientIdStr,
            commodityId: commodityIdStr,
            warehouseId: warehouseIdStr,
            quantityMT: row.quantityMT,
            date: formatDateToISO(transactionDate),
            source: 'BULK_UPLOAD',
            ...tenantFilter,
          });
          
          if (!existingTxn) {
            const txnResult = await db.collection('transactions').insertOne(transactionData);
            console.log(`[Bulk Upload] Row ${rowNum}: Transaction record created with ID: ${txnResult.insertedId}`);
          } else {
            console.log(`[Bulk Upload] Row ${rowNum}: Transaction record already exists with same bulk_upload source, skipping duplicate`);
          }

          const commodityDoc = commodityDocMap.get(commodityId.toString());
          const ratePerMTPerDay = Number(
            commodityDoc?.ratePerMtPerDay ??
            (commodityDoc?.ratePerMtMonth ? commodityDoc.ratePerMtMonth / 30 : undefined) ??
            10
          );
          console.log(`[Bulk Upload] Row ${rowNum}: Creating stock entry for inward transaction...`);
          const stockResult = await createStockEntry({
            clientId: clientId.toString(),
            warehouseId: warehouseId.toString(),
            commodityId: commodityId.toString(),
            direction: 'INWARD',
            quantityMT: row.quantityMT,
            bagsCount: row.bagsCount,
            inwardDate: formatDateToISO(transactionDate),
            ratePerMTPerDay,
            gatePass: row.gatePass,
            remarks: `Bulk upload INWARD row ${rowNum}`,
          });

          if (!stockResult.success) {
            throw new Error(`Failed to sync inward stock entry: ${stockResult.message}`);
          }
        } else if (row.type === 'OUTWARD') {
          console.log(`[Bulk Upload] Row ${rowNum}: Validating Outward stock...`);
          await validateOutwardStock(
            clientId.toString(),
            commodityId.toString(),
            warehouseId.toString(),
            transactionDate,
            row.quantityMT
          );

          console.log(`[Bulk Upload] Row ${rowNum}: Creating Outward model...`);
          const outwardRecord = await Outward.create({
            clientId,
            commodityId,
            warehouseId,
            quantityMT: row.quantityMT,
            bagsCount: row.bagsCount,
            stackNo: row.stackNo,
            lotNo: row.lotNo,
            gatePass: row.gatePass,
            date: transactionDate,
            userId: session.user?.id ? new mongoose.Types.ObjectId(session.user.id) : undefined,
            userEmail: session.user?.email,
          });
          console.log(`[Bulk Upload] Row ${rowNum}: Outward model created with ID: ${outwardRecord._id}`);

          // Also create transaction record for display in reports
          console.log(`[Bulk Upload] Row ${rowNum}: Creating transaction record...`);
          const transactionData = appendOwnershipForMongo({
            direction: 'OUTWARD',
            clientId: clientIdStr,
            commodityId: commodityIdStr,
            warehouseId: warehouseIdStr,
            quantityMT: row.quantityMT,
            bagsCount: row.bagsCount,
            stackNo: row.stackNo,
            lotNo: row.lotNo,
            gatePass: row.gatePass,
            clientName,
            commodityName,
            warehouseName,
            date: formatDateToISO(transactionDate),
            accountId: clientIdStr,
            userId: session.user?.id ? new mongoose.Types.ObjectId(session.user.id) : undefined,
            userEmail: session.user?.email,
            source: 'BULK_UPLOAD',
            createdAt: new Date(),
          }, session);
          
          // Verify this transaction doesn't already exist with exact match
          const existingTxn = await db.collection('transactions').findOne({
            direction: 'OUTWARD',
            clientId: clientIdStr,
            commodityId: commodityIdStr,
            warehouseId: warehouseIdStr,
            quantityMT: row.quantityMT,
            date: formatDateToISO(transactionDate),
            source: 'BULK_UPLOAD',
            ...tenantFilter,
          });
          
          if (!existingTxn) {
            const txnResult = await db.collection('transactions').insertOne(transactionData);
            console.log(`[Bulk Upload] Row ${rowNum}: Transaction record created with ID: ${txnResult.insertedId}`);
          } else {
            console.log(`[Bulk Upload] Row ${rowNum}: Transaction record already exists with same bulk_upload source, skipping duplicate`);
          }

          const commodityDoc = commodityDocMap.get(commodityId.toString());
          const ratePerMTPerDay = Number(
            commodityDoc?.ratePerMtPerDay ??
            (commodityDoc?.ratePerMtMonth ? commodityDoc.ratePerMtMonth / 30 : undefined) ??
            10
          );
          console.log(`[Bulk Upload] Row ${rowNum}: Creating stock entry for outward transaction...`);
          const stockResult = await createStockEntry({
            clientId: clientId.toString(),
            warehouseId: warehouseId.toString(),
            commodityId: commodityId.toString(),
            direction: 'OUTWARD',
            quantityMT: row.quantityMT,
            bagsCount: row.bagsCount,
            inwardDate: formatDateToISO(transactionDate),
            actualOutwardDate: formatDateToISO(transactionDate),
            ratePerMTPerDay,
            gatePass: row.gatePass,
            remarks: `Bulk upload OUTWARD row ${rowNum}`,
          });

          if (!stockResult.success) {
            throw new Error(`Failed to sync outward stock entry: ${stockResult.message}`);
          }
        }

        const transactionMonth = formatDateToISO(transactionDate).slice(0, 7);
        invoiceMonths.add(transactionMonth);

        if (row.type === 'OUTWARD') {
          const previousMonthDate = new Date(transactionDate.getTime());
          previousMonthDate.setUTCDate(1);
          previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
          invoiceMonths.add(formatDateToISO(previousMonthDate).slice(0, 7));
        }

        successCount++;
        console.log(`[Bulk Upload] Row ${rowNum}: Successfully processed`);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Bulk Upload] Row ${rowNum} error:`, errorMsg);
        errors.push({ row: rowNum, error: errorMsg });
      }
    }

    if (invoiceMonths.size > 0) {
      for (const invoiceMonth of invoiceMonths) {
        try {
          console.log(`[Bulk Upload] Regenerating invoice for month ${invoiceMonth}`);
          await generateMonthlyInvoices(invoiceMonth, session.user?.id, tenantFilter);
        } catch (invoiceError: unknown) {
          const message = invoiceError instanceof Error ? invoiceError.message : String(invoiceError);
          console.warn(`[Bulk Upload] Invoice regeneration failed for ${invoiceMonth}: ${message}`);
          warnings.push(`Invoice regeneration failed for ${invoiceMonth}: ${message}`);
        }
      }
    }
    
    console.log(`[Bulk Upload] Processing complete: ${successCount} successful, ${errors.length} errors, ${warnings.length} warnings`);

    const result: ProcessResult = {
      success: errors.length === 0,
      totalRows: rows.length,
      successCount,
      errorCount: errors.length,
      errors: errors.slice(0, 50), // Return first 50 errors
      warnings: warnings.length > 0 ? warnings : undefined,
    };
    
    if (successCount > 0) {
      await logActivity({
        actionType: 'CREATE',
        module: 'Bulk Upload',
        description: `Bulk uploaded ${successCount} transaction(s)`,
        storageType: 'Dry Storage',
        sessionFallback: session
      });
    }

    console.log(`[Bulk Upload] Returning result:`, result);
    return NextResponse.json(result, { status: errors.length === 0 ? 200 : 207 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to process bulk upload';
    console.error('[Bulk Upload] Fatal error:', error);
    return NextResponse.json({
      success: false,
      totalRows: 0,
      successCount: 0,
      errorCount: 1,
      errors: [{ row: 0, error: message }],
      error: message,
    }, { status: 400 });
  }
}
