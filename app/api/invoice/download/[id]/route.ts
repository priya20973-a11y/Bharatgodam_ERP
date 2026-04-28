import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { generateMonthlyInvoicePDF } from '@/app/actions/monthly-invoice-pdf';
import { getClientMonthlyLedger } from '@/app/actions/ledger';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function findClientDocument(db: any, clientId: string, tenantFilter: any) {
  if (!clientId?.trim()) return null;

  let client: any = null;
  const isObjectId = ObjectId.isValid(clientId);

  if (isObjectId) {
    try {
      client = await db.collection('clients').findOne({ _id: new ObjectId(clientId), ...tenantFilter });
    } catch {
      client = null;
    }
  }

  if (!client) {
    try {
      client = await db.collection('client_accounts').findOne({
        ...(isObjectId ? { _id: new ObjectId(clientId) } : {}),
        bookingId: clientId,
        ...tenantFilter,
      });
    } catch {
      client = null;
    }
  }

  return client;
}

function resolveClientPan(client: any) {
  return client?.panNumber || client?.panCard || client?.PAN || client?.pan || '';
}

function resolveClientGst(client: any) {
  return client?.gstNumber || client?.gst || client?.gstin || '';
}

async function findInvoiceMasterByIdentifier(db: any, id: string, tenantFilter: any) {
  if (!id?.trim()) return null;
  let invoiceMaster = null;

  if (ObjectId.isValid(id)) {
    try {
      invoiceMaster = await db.collection('invoice_master').findOne({ _id: new ObjectId(id), ...tenantFilter });
    } catch {
      invoiceMaster = null;
    }
  }

  if (!invoiceMaster) {
    invoiceMaster = await db.collection('invoice_master').findOne({ invoiceId: id, ...tenantFilter });
  }

  if (!invoiceMaster && id.includes('-')) {
    const parts = id.split('-');
    if (parts.length >= 3 && ObjectId.isValid(parts[0]) && /^\d{4}$/.test(parts[1]) && /^\d{2}$/.test(parts[2])) {
      const clientId = parts[0];
      const invoiceMonth = `${parts[1]}-${parts[2]}`;
      const warehouseId = parts.length > 3 ? parts.slice(3).join('-') : undefined;

      try {
        const query: any = {
          clientId: new ObjectId(clientId),
          invoiceMonth,
          ...tenantFilter,
        };
        if (warehouseId) {
          query.warehouseId = new ObjectId(warehouseId);
        }
        invoiceMaster = await db.collection('invoice_master').findOne(query);
      } catch {
        invoiceMaster = null;
      }
    }
  }

  return invoiceMaster;
}

async function buildInvoiceFromLedger(db: any, id: string, warehouseId?: string, tenantFilter?: any) {
  if (!id?.includes('-')) return null;
  const parts = id.split('-');
  if (parts.length < 3) return null;

  const [clientId, yearPart, monthPart, ...warehouseParts] = parts;
  if (!ObjectId.isValid(clientId) || !/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart)) {
    return null;
  }

  const invoiceMonth = `${yearPart}-${monthPart}`;
  const resolvedWarehouseId = warehouseId || (warehouseParts.length ? warehouseParts.join('-') : undefined);
  if (!resolvedWarehouseId) return null;
  const ledgerResult = await getClientMonthlyLedger(clientId, invoiceMonth, resolvedWarehouseId, tenantFilter);
  if (!ledgerResult.success || !ledgerResult.data?.months?.length) {
    return null;
  }

  const ledgerInvoice = ledgerResult.data.months[0];
  const client = await findClientDocument(db, clientId, tenantFilter);
  if (!client) return null;

  const resolvedWarehouse = await db.collection('warehouses').findOne({ _id: new ObjectId(resolvedWarehouseId), ...tenantFilter });
  if (!resolvedWarehouse) return null;

  const monthNamesFull = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = monthNamesFull[Number(monthPart) - 1] || monthPart;
  const year = Number(yearPart);
  const invoiceMonthString = invoiceMonth;

  const wspInitials = resolvedWarehouse.name?.split(' ').map((word: string) => word.charAt(0).toUpperCase()).join('') || 'UNKNOWN';
  const invoiceIdPattern = `^${wspInitials}/${month}/${yearPart}/\\d{5}$`;
  const existingInvoices = await db.collection('invoice_master')
    .find({ warehouseId: new ObjectId(resolvedWarehouseId), invoiceMonth: invoiceMonthString, invoiceId: { $regex: invoiceIdPattern }, ...tenantFilter })
    .project({ invoiceId: 1 })
    .toArray();

  const maxSerial = existingInvoices.reduce((max: number, inv: any) => {
    const match = inv.invoiceId?.match(/\/(\d{5})$/);
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);

  const serial = String(maxSerial + 1).padStart(5, '0');
  const invoiceNumber = `${wspInitials}/${month}/${yearPart}/${serial}`;

  const monthEnd = new Date(`${invoiceMonthString}-01`);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);

  const userId = tenantFilter?.userId ??
    (Array.isArray(tenantFilter?.$or)
      ? tenantFilter.$or.find((filter: any) => filter.userId)?.userId
      : undefined);

  const invoiceMaster: any = {
    clientId: new ObjectId(clientId),
    warehouseId: new ObjectId(resolvedWarehouseId),
    invoiceId: invoiceNumber,
    invoiceMonth: invoiceMonthString,
    totalAmount: Number(ledgerInvoice.summary.totalRent ?? 0),
    status: 'DRAFT',
    generatedAt: new Date(),
    dueDate: monthEnd.toISOString().split('T')[0],
    userId: userId ? (typeof userId === 'string' ? new ObjectId(userId) : userId) : undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const masterResult = await db.collection('invoice_master').insertOne(invoiceMaster);
  const masterId = masterResult.insertedId;

  const lineItems = ledgerInvoice.rows.map((item: any) => ({
    invoiceMasterId: masterId,
    commodityName: item.commodity || '',
    daysOccupied: Number(item.days ?? 0),
    averageQuantityMT: Number(item.qty ?? 0),
    ratePerMTPerDay: Number(item.rate ?? 0) || 0,
    totalAmount: Number(item.rent ?? 0),
    periodStart: item.fromDate || '',
    periodEnd: item.toDate || '',
    createdAt: new Date(),
  }));

  if (lineItems.length > 0) {
    await db.collection('invoice_line_items').insertMany(lineItems as any[]);
  }

  return {
    bookingId: clientId,
    invoiceNumber,
    clientName: client.name || client.clientName || '',
    panNumber: resolveClientPan(client),
    gstNumber: resolveClientGst(client),
    month,
    year,
    periods: ledgerInvoice.rows.map((item: any) => ({
      startDate: item.fromDate || '',
      endDate: item.toDate || '',
      quantityMT: Number(item.qty ?? 0),
      daysTotal: Number(item.days ?? 0),
      rentTotal: Number(item.rent ?? 0),
      status: item.status || 'COMPLETED',
      commodityName: item.commodity || '',
    })),
    warehouseId: resolvedWarehouseId,
    warehouseName: resolvedWarehouse.name || '',
    totalRent: Number(ledgerInvoice.summary.totalRent ?? 0),
    previousBalance: Number(ledgerInvoice.summary.previousBalance ?? 0),
    currentPayments: Number(ledgerInvoice.summary.payments ?? 0),
    newBalance: Number(ledgerInvoice.summary.outstanding ?? 0),
    invoiceDate: new Date().toISOString().split('T')[0],
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const tenantFilter = getTenantFilterForMongo(session);

    const { id } = await params;
    const warehouseId = request.nextUrl.searchParams.get('warehouseId') || undefined;
    const db = await getDb();
    const invoiceMaster = await findInvoiceMasterByIdentifier(db, id, tenantFilter);

    let monthlyInvoice: any = null;
    let client: any = null;
    let warehouse: any = null;

    if (invoiceMaster) {
      client = await db.collection('clients').findOne({ _id: invoiceMaster.clientId, ...tenantFilter });
      warehouse = await db.collection('warehouses').findOne({ _id: invoiceMaster.warehouseId, ...tenantFilter });
      const lineItems = await db.collection('invoice_line_items').find({ invoiceMasterId: invoiceMaster._id }).toArray();

      if (!client || !warehouse) {
        return NextResponse.json({ error: 'Client or warehouse not found' }, { status: 404 });
      }

      const [yearPart, monthPart] = invoiceMaster.invoiceMonth.split('-');
      const month = monthNames[Number(monthPart) - 1] || monthPart;
      const year = Number(yearPart) || new Date().getFullYear();

      monthlyInvoice = {
        bookingId: invoiceMaster._id?.toString() || id,
        invoiceNumber: invoiceMaster.invoiceId || id,
        clientName: client.name || client.clientName || '',
        panNumber: resolveClientPan(client),
        gstNumber: resolveClientGst(client),
        month,
        year,
        periods: lineItems.map((item: any) => ({
          startDate: item.periodStart || '',
          endDate: item.periodEnd || '',
          quantityMT: Number(item.averageQuantityMT ?? 0),
          daysTotal: Number(item.daysOccupied ?? 0),
          rentTotal: Number(item.totalAmount ?? 0),
          status: invoiceMaster.status || 'DRAFT',
          commodityName: item.commodityName || '',
        })),
        warehouseId: invoiceMaster.warehouseId?.toString(),
        warehouseName: warehouse.name || '',
        totalRent: Number(invoiceMaster.totalAmount ?? 0),
        previousBalance: 0,
        currentPayments: 0,
        newBalance: Number(invoiceMaster.totalAmount ?? 0),
        invoiceDate: invoiceMaster.generatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      };
    } else {
      monthlyInvoice = await buildInvoiceFromLedger(db, id, warehouseId, tenantFilter);
      if (!monthlyInvoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
    }

    const pdfBuffer = await generateMonthlyInvoicePDF(monthlyInvoice);

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${monthlyInvoice.bookingId.replace(/\//g, '_')}.pdf"`,
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to generate invoice';
    console.error('Invoice download error:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
