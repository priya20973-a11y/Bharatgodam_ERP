import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getClientMonthlyLedger } from '@/app/actions/ledger';

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

export async function findInvoiceMasterByIdentifier(db: any, id: string, tenantFilter: any) {
  if (!id?.trim()) return null;
  let invoiceMaster: any = null;

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

export async function buildMonthlyInvoiceFromLedger(db: any, id: string, warehouseId?: string, tenantFilter?: any) {
  if (!id?.includes('-')) return null;
  const parts = id.split('-');
  if (parts.length < 3) return null;

  const [clientId, yearPart, monthPart, ...warehouseParts] = parts;
  if (!ObjectId.isValid(clientId) || !/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart)) {
    return null;
  }

  const invoiceMonth = `${yearPart}-${monthPart}`;
  const resolvedWarehouseId = warehouseId || (warehouseParts.length ? warehouseParts.join('-') : undefined);

  const ledgerResult = await getClientMonthlyLedger(clientId, invoiceMonth, resolvedWarehouseId, tenantFilter);
  if (!ledgerResult.success || !ledgerResult.data?.months?.length) {
    return null;
  }

  const ledgerInvoice = ledgerResult.data.months[0];
  const client = await findClientDocument(db, clientId, tenantFilter);
  if (!client) return null;

  const resolvedWarehouse = resolvedWarehouseId
    ? await db.collection('warehouses').findOne({ _id: new ObjectId(resolvedWarehouseId), ...tenantFilter })
    : null;

  const month = monthNames[Number(monthPart) - 1] || monthPart;
  const year = Number(yearPart);
  const invoiceMonthString = invoiceMonth;

  let invoiceNumber = `INV/${month}/${yearPart}/00000`;
  if (resolvedWarehouseId && resolvedWarehouse) {
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
    invoiceNumber = `${wspInitials}/${month}/${yearPart}/${serial}`;
  }

  const monthEnd = new Date(`${invoiceMonthString}-01`);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);

  const userId = tenantFilter?.userId ||
    (Array.isArray(tenantFilter?.$or)
      ? tenantFilter.$or.find((filter: any) => filter.userId)?.userId
      : undefined);

  const invoiceMaster: any = {
    clientId: new ObjectId(clientId),
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

  if (resolvedWarehouseId) {
    invoiceMaster.warehouseId = new ObjectId(resolvedWarehouseId);
  }

  let masterId: any = null;
  if (resolvedWarehouseId) {
    const masterResult = await db.collection('invoice_master').insertOne(invoiceMaster);
    masterId = masterResult.insertedId;
  }

  const lineItems = ledgerInvoice.rows.map((item: any) => ({
    invoiceMasterId: masterId,
    commodityName: item.commodity || '',
    daysOccupied: Number(item.days ?? 0),
    averageQuantityMT: Number(item.qty ?? 0),
    ratePerMTPerDay: Number(item.rate ?? 0) || 0,
    totalAmount: Number(item.rent ?? 0),
    periodStart: item.fromDate || '',
    periodEnd: item.toDate || '',
    status: item.status || 'COMPLETED',
    createdAt: new Date(),
  }));

  if (lineItems.length > 0 && masterId) {
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
    warehouseName: resolvedWarehouse?.name || '',
    totalRent: Number(ledgerInvoice.summary.totalRent ?? 0),
    previousBalance: Number(ledgerInvoice.summary.previousBalance ?? 0),
    currentPayments: Number(ledgerInvoice.summary.payments ?? 0),
    newBalance: Number(ledgerInvoice.summary.outstanding ?? 0),
    invoiceDate: new Date().toISOString().split('T')[0],
  };
}

export async function resolveMonthlyInvoiceFromId(id: string, warehouseId: string | undefined, tenantFilter: any) {
  const db = await getDb();
  const invoiceMaster = await findInvoiceMasterByIdentifier(db, id, tenantFilter);

  if (invoiceMaster) {
    const client = await db.collection('clients').findOne({ _id: invoiceMaster.clientId, ...tenantFilter });
    const warehouse = await db.collection('warehouses').findOne({ _id: invoiceMaster.warehouseId, ...tenantFilter });
    if (!client || !warehouse) return null;

    const lineItems = await db.collection('invoice_line_items').find({ invoiceMasterId: invoiceMaster._id }).toArray();

    let ledgerInvoice: any = null;
    if (invoiceMaster.clientId && invoiceMaster.warehouseId && invoiceMaster.invoiceMonth) {
      const ledgerResult = await getClientMonthlyLedger(
        invoiceMaster.clientId.toString(),
        invoiceMaster.invoiceMonth,
        invoiceMaster.warehouseId.toString(),
        tenantFilter
      );

      if (ledgerResult.success && ledgerResult.data?.months?.length) {
        ledgerInvoice = ledgerResult.data.months[0];
      }
    }

    if (ledgerInvoice) {
      const [yearPart, monthPart] = invoiceMaster.invoiceMonth.split('-');
      const month = monthNames[Number(monthPart) - 1] || monthPart;
      const year = Number(yearPart) || new Date().getFullYear();

      return {
        bookingId: invoiceMaster.clientId?.toString() || id,
        invoiceNumber: invoiceMaster.invoiceId || id,
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
        warehouseId: invoiceMaster.warehouseId?.toString(),
        warehouseName: warehouse.name || '',
        totalRent: Number(ledgerInvoice.summary.totalRent ?? invoiceMaster.totalAmount ?? 0),
        previousBalance: Number(ledgerInvoice.summary.previousBalance ?? 0),
        currentPayments: Number(ledgerInvoice.summary.payments ?? 0),
        newBalance: Number(ledgerInvoice.summary.outstanding ?? invoiceMaster.totalAmount ?? 0),
        invoiceDate: invoiceMaster.generatedAt?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      };
    }

    if (lineItems.some((item: any) => !item.status) && invoiceMaster.clientId && invoiceMaster.warehouseId && invoiceMaster.invoiceMonth) {
      const ledgerResult = await getClientMonthlyLedger(
        invoiceMaster.clientId.toString(),
        invoiceMaster.invoiceMonth,
        invoiceMaster.warehouseId.toString(),
        tenantFilter
      );

      if (ledgerResult.success && ledgerResult.data?.months?.length) {
        const ledgerInvoiceForStatus = ledgerResult.data.months[0];
        const ledgerRowStatusMap = new Map<string, string>();

        ledgerInvoiceForStatus.rows.forEach((row: any) => {
          const key = `${row.fromDate || ''}|${row.toDate || ''}|${row.commodity || ''}|${row.qty ?? ''}|${row.days ?? ''}`;
          ledgerRowStatusMap.set(key, row.status || 'COMPLETED');
        });

        lineItems.forEach((item: any) => {
          if (!item.status) {
            const key = `${item.periodStart || ''}|${item.periodEnd || ''}|${item.commodityName || ''}|${item.averageQuantityMT ?? ''}|${item.daysOccupied ?? ''}`;
            if (ledgerRowStatusMap.has(key)) {
              item.status = ledgerRowStatusMap.get(key);
            }
          }
        });
      }
    }

    const [yearPart, monthPart] = invoiceMaster.invoiceMonth.split('-');
    const month = monthNames[Number(monthPart) - 1] || monthPart;
    const year = Number(yearPart) || new Date().getFullYear();

    return {
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
        status: item.status || 'COMPLETED',
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
  }

  return await buildMonthlyInvoiceFromLedger(db, id, warehouseId, tenantFilter);
}
