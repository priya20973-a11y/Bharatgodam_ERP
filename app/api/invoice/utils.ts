import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { getClientMonthlyLedger } from '@/app/actions/client-ledger';
import { calculateStorageDays } from '@/lib/storage-engine';
import { requireSession, getTenantFilterForMongo } from '@/lib/ownership';

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

async function findInvoiceAdjustments(
  db: any,
  invoiceId: string,
  masterId?: string
) {
  const query: any = { $or: [{ invoiceId }] };

  if (masterId) {
    query.$or.push({ masterId });
  }

  return db.collection('invoice_adjustments').find(query).toArray();
}

function normalizeAdjustmentItems(items: any[]) {
  return (items || []).map((item: any) => ({
    id: item._id?.toString(),
    name: item.name || item.note || 'Additional Charge',
    amount: Number((item.amount ?? item.additionalCharges) || 0),
    note: item.note || '',
  }));
}

function sumAdjustmentItems(items: any[]) {
  return (items || []).reduce(
    (sum: number, item: any) => sum + Number(item.amount || 0),
    0
  );
}

async function findClientDocument(
  db: any,
  clientId: string,
  tenantFilter: any
) {
  if (!clientId?.trim()) return null;

  let client: any = null;

  const isObjectId = ObjectId.isValid(clientId);

  if (isObjectId) {
    try {
      client = await db.collection('clients').findOne({
        _id: new ObjectId(clientId),
        ...tenantFilter,
      });
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
  return (
    client?.panNumber ||
    client?.panCard ||
    client?.PAN ||
    client?.pan ||
    ''
  );
}

function resolveClientGst(client: any) {
  return client?.gstNumber || client?.gst || client?.gstin || '';
}

async function resolveInvoiceCompanyProfile(
  db: any,
  warehouse: any,
  invoiceMaster: any
) {
  if (!warehouse && !invoiceMaster) return null;

  let user: any = null;
  const ownerId = invoiceMaster?.userId || warehouse?.userId;
  const ownerEmail = invoiceMaster?.userEmail || warehouse?.userEmail;

  if (ownerId) {
    try {
      user = await db.collection('users').findOne({ _id: new ObjectId(ownerId) });
    } catch {
      user = null;
    }
  }

  if (!user && ownerEmail) {
    user = await db.collection('users').findOne({ email: ownerEmail });
  }

  if (!user) return null;

  return {
    companyName: user.companyName || user.fullName || '',
    companyAddress:
      user.address || user.warehouseLocation || warehouse?.address || '',
    companyPhone: user.phoneNumber || '',
    companyEmail: user.email || '',
    companyLogo: user.companyLogo || '',
    bankName: user.bankName || '',
    bankAccountNumber: user.bankAccountNumber || '',
    ifscCode: user.ifscCode || '',
    bankBranch: user.bankBranch || '',
  };
}

export async function findInvoiceMasterByIdentifier(
  db: any,
  id: string,
  tenantFilter: any,
  mode?: 'ledger' | 'transactions'
) {
  if (!id?.trim()) return null;

  const invoiceTypeFilter: any =
    mode === 'transactions'
      ? { invoiceType: 'transaction' }
      : mode === 'ledger'
      ? { invoiceType: { $ne: 'transaction' } }
      : {};

  let invoiceMaster: any = null;

  if (ObjectId.isValid(id)) {
    try {
      invoiceMaster = await db.collection('invoice_master').findOne({
        _id: new ObjectId(id),
        ...invoiceTypeFilter,
        ...tenantFilter,
      });
    } catch {
      invoiceMaster = null;
    }
  }

  if (!invoiceMaster) {
    invoiceMaster = await db.collection('invoice_master').findOne({
      invoiceId: id,
      ...invoiceTypeFilter,
      ...tenantFilter,
    });
  }

  if (!invoiceMaster && id.includes('-')) {
    const parts = id.split('-');

    if (
      parts.length >= 3 &&
      ObjectId.isValid(parts[0]) &&
      /^\d{4}$/.test(parts[1]) &&
      /^\d{2}$/.test(parts[2])
    ) {
      const clientId = parts[0];

      const invoiceMonth = `${parts[1]}-${parts[2]}`;

      const warehouseId =
        parts.length > 3 ? parts.slice(3).join('-') : undefined;

      try {
        const query: any = {
          clientId: new ObjectId(clientId),
          invoiceMonth,
          ...invoiceTypeFilter,
          ...tenantFilter,
        };

        if (warehouseId) {
          query.warehouseId = new ObjectId(warehouseId);
        }

        invoiceMaster = await db
          .collection('invoice_master')
          .findOne(query);
      } catch {
        invoiceMaster = null;
      }
    }
  }

  return invoiceMaster;
}

function looksLikeTransactionInvoiceIdentifier(id: string | undefined): boolean {
  if (!id?.trim()) return false;
  const parts = id.split('-');
  return (
    parts.length >= 3 &&
    ObjectId.isValid(parts[0]) &&
    /^\d{4}$/.test(parts[1]) &&
    /^\d{2}$/.test(parts[2])
  );
}

function buildTransactionInvoiceIdentifierFromMaster(master: any): string | null {
  if (!master?.clientId || !master?.invoiceMonth) return null;
  const clientId = master.clientId.toString?.()
    ? master.clientId.toString()
    : String(master.clientId);
  const warehouseId = master.warehouseId
    ? master.warehouseId.toString?.()
      ? master.warehouseId.toString()
      : String(master.warehouseId)
    : undefined;

  return warehouseId
    ? `${clientId}-${master.invoiceMonth}-${warehouseId}`
    : `${clientId}-${master.invoiceMonth}`;
}

export async function buildMonthlyInvoiceFromTransactions(
  db: any,
  id: string,
  warehouseId?: string,
  tenantFilter?: any
) {
  if (!id?.includes('-')) return null;

  const parts = id.split('-');

  if (parts.length < 3) return null;

  const [clientId, yearPart, monthPart, ...warehouseParts] = parts;

  if (
    !ObjectId.isValid(clientId) ||
    !/^\d{4}$/.test(yearPart) ||
    !/^\d{2}$/.test(monthPart)
  ) {
    return null;
  }

  const invoiceMonth = `${yearPart}-${monthPart}`;
  const resolvedWarehouseId =
    warehouseId ||
    (warehouseParts.length ? warehouseParts.join('-') : undefined);

  if (!tenantFilter) {
    try {
      const session = await requireSession();
      tenantFilter = getTenantFilterForMongo(session);
    } catch (error) {
      tenantFilter = {};
    }
  }

  const existingMaster = await findInvoiceMasterByIdentifier(
    db,
    id,
    tenantFilter,
    'transactions'
  );

  const transactions = await getTransactionsForInvoiceMonth(
    db,
    clientId,
    resolvedWarehouseId,
    invoiceMonth,
    tenantFilter
  );

  const transactionRows = transformTransactionsToBillingRows(
    transactions,
    invoiceMonth
  );

  if (!transactionRows || !transactionRows.length) {
    return null;
  }

  const client = await findClientDocument(db, clientId, tenantFilter);
  if (!client) return null;

  const resolvedWarehouse = resolvedWarehouseId
    ? await db.collection('warehouses').findOne({
        _id: new ObjectId(resolvedWarehouseId),
        ...tenantFilter,
      })
    : null;

  const companyProfile =
    (await resolveInvoiceCompanyProfile(db, resolvedWarehouse, null)) || {};

  const month = monthNames[Number(monthPart) - 1] || monthPart;
  const year = Number(yearPart);
  const invoiceMonthString = invoiceMonth;

  let invoiceNumber = existingMaster?.invoiceId || `INV/${month}/${yearPart}/00000`;
  if (resolvedWarehouseId && resolvedWarehouse && !existingMaster) {
    const wspInitials =
      resolvedWarehouse.name
        ?.split(' ')
        .map((word: string) => word.charAt(0).toUpperCase())
        .join('') || 'UNKNOWN';

    const invoiceIdPattern = `^${wspInitials}/${month}/${yearPart}/\\d{5}$`;
    const existingInvoices = await db
      .collection('invoice_master')
      .find({
        warehouseId: new ObjectId(resolvedWarehouseId),
        invoiceMonth: invoiceMonthString,
        invoiceType: 'transaction',
        invoiceId: { $regex: invoiceIdPattern },
        ...tenantFilter,
      })
      .project({ invoiceId: 1 })
      .toArray();

    const maxSerial = existingInvoices.reduce(
      (max: number, inv: any) => {
        const match = inv.invoiceId?.match(/\/(\d{5})$/);
        if (!match) return max;
        return Math.max(max, Number(match[1]));
      },
      0
    );

    const serial = String(maxSerial + 1).padStart(5, '0');
    invoiceNumber = `${wspInitials}/${month}/${yearPart}/${serial}`;
  }

  const monthEnd = new Date(`${invoiceMonthString}-01`);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);

  const userId =
    tenantFilter?.userId ||
    (Array.isArray(tenantFilter?.$or)
      ? tenantFilter.$or.find((filter: any) => filter.userId)?.userId
      : undefined);

  let masterId: any = existingMaster?._id ?? null;

  if (resolvedWarehouseId && !existingMaster) {
    const invoiceMaster: any = {
      clientId: new ObjectId(clientId),
      invoiceId: invoiceNumber,
      invoiceMonth: invoiceMonthString,
      totalAmount: Number(
        transactionRows.reduce(
          (sum: number, row: any) => sum + Number(row.rentTotal || 0),
          0
        )
      ),
      status: 'DRAFT',
      invoiceType: 'transaction',
      sourceType: 'transactions',
      generatedAt: new Date(),
      dueDate: monthEnd.toISOString().split('T')[0],
      userId: userId
        ? typeof userId === 'string'
          ? new ObjectId(userId)
          : userId
        : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    invoiceMaster.warehouseId = new ObjectId(resolvedWarehouseId);

    const masterResult = await db
      .collection('invoice_master')
      .insertOne(invoiceMaster);

    masterId = masterResult.insertedId;

    const lineItems = transactionRows.map((item: any) => ({
      invoiceMasterId: masterId,
      commodityName: item.commodityName || '',
      daysOccupied: Number(item.daysTotal || 0),
      averageQuantityMT: Number(item.quantityMT || 0),
      ratePerMTPerDay: Number(item.rate || 0),
      totalAmount: Number(item.rentTotal || 0),
      periodStart: item.startDate || '',
      periodEnd: item.endDate || '',
      status: item.status || 'COMPLETED',
      createdAt: new Date(),
    }));

    if (lineItems.length > 0) {
      await db.collection('invoice_line_items').insertMany(lineItems as any[]);
    }
  }

  const totalRent = transactionRows.reduce(
    (sum: number, row: any) => sum + Number(row.rentTotal || 0),
    0
  );

  return {
    bookingId: clientId,
    invoiceId: invoiceNumber,
    invoiceNumber,
    clientName: client.name || client.clientName || '',
    panNumber: resolveClientPan(client),
    gstNumber: resolveClientGst(client),
    month,
    year,
    periods: transactionRows,
    transactions: transactionRows,
    warehouseId: resolvedWarehouseId,
    warehouseName: resolvedWarehouse?.name || '',
    ...companyProfile,
    totalRent,
    previousBalance: 0,
    currentPayments: 0,
    newBalance: totalRent,
    additionalCharges: 0,
    additionalChargeItems: [],
    invoiceDate: new Date().toISOString().split('T')[0],
  };
}

export async function buildMonthlyInvoiceFromLedger(
  db: any,
  id: string,
  warehouseId?: string,
  tenantFilter?: any
) {
  if (!id?.includes('-')) return null;

  const parts = id.split('-');

  if (parts.length < 3) return null;

  const [clientId, yearPart, monthPart, ...warehouseParts] = parts;

  if (
    !ObjectId.isValid(clientId) ||
    !/^\d{4}$/.test(yearPart) ||
    !/^\d{2}$/.test(monthPart)
  ) {
    return null;
  }

  const invoiceMonth = `${yearPart}-${monthPart}`;

  const resolvedWarehouseId =
    warehouseId ||
    (warehouseParts.length ? warehouseParts.join('-') : undefined);

  const ledgerResult = await getClientMonthlyLedger(
    clientId,
    invoiceMonth,
    resolvedWarehouseId,
    tenantFilter
  );

  if (!ledgerResult.success || !ledgerResult.data?.months?.length) {
    return null;
  }

  const ledgerInvoice = ledgerResult.data.months[0];

  const client = await findClientDocument(
    db,
    clientId,
    tenantFilter
  );

  if (!client) return null;

  const resolvedWarehouse = resolvedWarehouseId
    ? await db.collection('warehouses').findOne({
        _id: new ObjectId(resolvedWarehouseId),
        ...tenantFilter,
      })
    : null;

  const companyProfile =
    (await resolveInvoiceCompanyProfile(
      db,
      resolvedWarehouse,
      null
    )) || {};

  const month =
    monthNames[Number(monthPart) - 1] || monthPart;

  const year = Number(yearPart);

  const invoiceMonthString = invoiceMonth;

  let invoiceNumber = `INV/${month}/${yearPart}/00000`;

  if (resolvedWarehouseId && resolvedWarehouse) {
    const wspInitials =
      resolvedWarehouse.name
        ?.split(' ')
        .map((word: string) =>
          word.charAt(0).toUpperCase()
        )
        .join('') || 'UNKNOWN';

    const invoiceIdPattern = `^${wspInitials}/${month}/${yearPart}/\\d{5}$`;

    const existingInvoices = await db
      .collection('invoice_master')
      .find({
        warehouseId: new ObjectId(resolvedWarehouseId),
        invoiceMonth: invoiceMonthString,
        invoiceId: { $regex: invoiceIdPattern },
        ...tenantFilter,
      })
      .project({ invoiceId: 1 })
      .toArray();

    const maxSerial = existingInvoices.reduce(
      (max: number, inv: any) => {
        const match = inv.invoiceId?.match(/\/(\d{5})$/);

        if (!match) return max;

        return Math.max(max, Number(match[1]));
      },
      0
    );

    const serial = String(maxSerial + 1).padStart(5, '0');

    invoiceNumber = `${wspInitials}/${month}/${yearPart}/${serial}`;
  }

  const monthEnd = new Date(`${invoiceMonthString}-01`);

  monthEnd.setMonth(monthEnd.getMonth() + 1);

  monthEnd.setDate(0);

  const userId =
    tenantFilter?.userId ||
    (Array.isArray(tenantFilter?.$or)
      ? tenantFilter.$or.find(
          (filter: any) => filter.userId
        )?.userId
      : undefined);

  const invoiceMaster: any = {
    clientId: new ObjectId(clientId),
    invoiceId: invoiceNumber,
    invoiceMonth: invoiceMonthString,
    totalAmount: Number(
      ledgerInvoice.summary.totalRent ?? 0
    ),
    status: 'DRAFT',
    generatedAt: new Date(),
    dueDate: monthEnd.toISOString().split('T')[0],
    userId: userId
      ? typeof userId === 'string'
        ? new ObjectId(userId)
        : userId
      : undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (resolvedWarehouseId) {
    invoiceMaster.warehouseId = new ObjectId(
      resolvedWarehouseId
    );
  }

  let masterId: any = null;

  if (resolvedWarehouseId) {
    const masterResult = await db
      .collection('invoice_master')
      .insertOne(invoiceMaster);

    masterId = masterResult.insertedId;
  }

  const lineItems = ledgerInvoice.rows.map(
    (item: any) => ({
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
    })
  );

  if (lineItems.length > 0 && masterId) {
    await db
      .collection('invoice_line_items')
      .insertMany(lineItems as any[]);
  }

  const transactions = await getTransactionsForInvoiceMonth(
    db,
    clientId,
    resolvedWarehouseId,
    invoiceMonth,
    tenantFilter
  );

  const transactionRows = transformTransactionsToBillingRows(
    transactions,
    invoiceMonth
  );

  const invoicePeriods =
    transactionRows.length > 0
      ? transactionRows
      : ledgerInvoice.rows.map((item: any) => ({
          startDate: item.fromDate || '',
          endDate: item.toDate || '',
          quantityMT: Number(item.qty ?? 0),
          daysTotal: Number(item.days ?? 0),
          rentTotal: Number(item.rent ?? 0),
          status: item.status || 'COMPLETED',
          commodityName: item.commodity || '',
        }));

  const previousBalance = Number(
    ledgerInvoice.summary.previousBalance ?? 0
  );
  const currentPayments = Number(
    ledgerInvoice.summary.payments ?? 0
  );

  const totalRent =
    transactionRows.length > 0
      ? transactionRows.reduce(
          (sum: number, row: any) => sum + (row.rentTotal || 0),
          0
        )
      : Number(ledgerInvoice.summary.totalRent ?? 0);

  const adjustments = await findInvoiceAdjustments(
    db,
    id
  );

  const additionalChargeItems =
    normalizeAdjustmentItems(adjustments);

  const additionalCharges =
    sumAdjustmentItems(additionalChargeItems);

  const newBalance =
    transactionRows.length > 0
      ? totalRent + previousBalance + additionalCharges - currentPayments
      : Number(ledgerInvoice.summary.outstanding ?? 0);

  return {
    bookingId: clientId,
    invoiceNumber,
    clientName: client.name || client.clientName || '',
    panNumber: resolveClientPan(client),
    gstNumber: resolveClientGst(client),
    month,
    year,
    periods: invoicePeriods,
    transactions:
      transactionRows.length > 0
        ? transactionRows
        : transactions,
    warehouseId: resolvedWarehouseId,
    warehouseName: resolvedWarehouse?.name || '',
    ...companyProfile,
    totalRent,
    previousBalance,
    currentPayments,
    newBalance,
    additionalCharges,
    additionalChargeItems,
    invoiceDate:
      new Date().toISOString().split('T')[0],
  };
}

/**
 * Fetch active inward stock entries for a given invoice month and client
 */
export async function getTransactionsForInvoiceMonth(
  db: any,
  clientId: any,
  warehouseId: any,
  invoiceMonth: string,
  tenantFilter: any
) {
  try {
    const [yearPart, monthPart] =
      invoiceMonth.split('-');
    const month = Number(monthPart);
    const year = Number(yearPart);

    if (
      !year ||
      !month ||
      month < 1 ||
      month > 12
    ) {
      return [];
    }

    const monthStart = new Date(
      Date.UTC(year, month - 1, 1)
    );
    const monthEnd = new Date(
      Date.UTC(year, month, 0, 23, 59, 59, 999)
    );

    const monthStartStr = monthStart
      .toISOString()
      .split('T')[0];
    const monthEndStr = monthEnd
      .toISOString()
      .split('T')[0];

    const clientIdValues: any[] = [];
    const warehouseIdValues: any[] = [];

    if (ObjectId.isValid(clientId)) {
      clientIdValues.push(new ObjectId(clientId));
      clientIdValues.push(clientId.toString());
    } else if (clientId !== undefined && clientId !== null) {
      clientIdValues.push(clientId);
    }

    if (warehouseId !== undefined && warehouseId !== null) {
      if (ObjectId.isValid(warehouseId)) {
        warehouseIdValues.push(new ObjectId(warehouseId));
        warehouseIdValues.push(warehouseId.toString());
      } else {
        warehouseIdValues.push(warehouseId);
      }
    }

    const directionValues = ['INWARD', 'OUTWARD', 'inward', 'outward'];
    const query: any = {
      clientId: {
        $in: clientIdValues.filter(
          (value) => value !== undefined && value !== null
        ),
      },
      direction: { $in: directionValues },
      $or: [
        { date: { $lte: monthEnd } },
        { date: { $lte: monthEndStr } },
        { inwardDate: { $lte: monthEnd } },
        { inwardDate: { $lte: monthEndStr } },
        { outwardDate: { $lte: monthEnd } },
        { outwardDate: { $lte: monthEndStr } },
        { actualOutwardDate: { $lte: monthEnd } },
        { actualOutwardDate: { $lte: monthEndStr } },
      ],
      ...tenantFilter,
    };

    if (warehouseIdValues.length) {
      query.warehouseId = {
        $in: warehouseIdValues.filter(
          (value) => value !== undefined && value !== null
        ),
      };
    }

    const transactions = await db
      .collection('transactions')
      .find(query)
      .sort({ date: 1, inwardDate: 1, actualOutwardDate: 1 })
      .toArray();

    const commodityIds: string[] = Array.from(
      new Set(
        transactions
          .map((txn: any) => txn.commodityId)
          .filter((id: any) => id !== undefined && id !== null)
          .map((id: any) => String(id))
      )
    );

    const commodityDocs = commodityIds.length
      ? await db
          .collection('commodities')
          .find({
            _id: {
              $in: commodityIds
                .filter((id: string) => ObjectId.isValid(id))
                .map((id: string) => new ObjectId(id)),
            },
          })
          .toArray()
      : [];

    const commodityMap = new Map<string, any>(
      commodityDocs.map((commodity: any) => [commodity._id.toString(), commodity])
    );

    return transactions.map((txn: any) => {
      const rawQuantity = txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0;
      const rawBags =
        txn.bags ??
        txn.bagsCount ??
        txn.bagCount ??
        txn.bags_count ??
        '';

      return {
        date: (
          txn.date || txn.inwardDate || txn.outwardDate || ''
        )
          .toString()
          .split('T')[0],
        inwardDate: txn.inwardDate || txn.date || '',
        actualOutwardDate:
          txn.actualOutwardDate || txn.outwardDate || null,
        outwardDate: txn.outwardDate || null,
        direction: (txn.direction || 'INWARD').toUpperCase(),
        commodityName:
          txn.commodityName || txn.commodity || 'Unknown',
        quantityMT: Number(rawQuantity || 0),
        quantity: Number(rawQuantity || 0),
        bags: rawBags,
        gatePass: txn.gatePass || txn.gatepass || '',
        ratePerMTPerDay: (() => {
          const txnRate = Number(
            txn.ratePerMTPerDay ??
              txn.rate ??
              txn.rateFixedAt ??
              txn.ratePerDayPerMT ??
              txn.ratePerDay ??
              txn.dailyRate ??
              0
          );
          if (txnRate > 0) {
            return txnRate;
          }

          const commodityId = txn.commodityId;
          const commodity =
            commodityId && commodityMap.has(String(commodityId))
              ? (commodityMap.get(String(commodityId)) as any)
              : null;

          if (commodity) {
            return Number(
              commodity.ratePerMtPerDay ??
                (commodity.ratePerMtMonth
                  ? commodity.ratePerMtMonth / 30
                  : 0)
            );
          }

          return 0;
        })(),
        monthlyRate: Number(
          txn.monthlyRate || txn.monthlyRatePerMT || 0
        ),
        commodityId: txn.commodityId,
        warehouseId: txn.warehouseId,
        clientId: txn.clientId,
      } as any;
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

/**
 * Convert transactions to billing rows based on storage period until month end
 */
function normalizeTransactionDateValue(value: any): string {
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  if (typeof value === 'string') {
    const rawValue = value.trim();
    if (!rawValue) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return rawValue;
    }
    if (rawValue.includes('T')) {
      return rawValue.split('T')[0];
    }
    const parsed = new Date(rawValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return '';
  }

  return '';
}

function resolveTransactionDateString(txn: any): string {
  const direction = (txn.direction || 'INWARD').toUpperCase();
  const rawDate =
    direction === 'OUTWARD'
      ? txn.actualOutwardDate || txn.outwardDate || txn.date || txn.inwardDate
      : txn.inwardDate || txn.date || txn.outwardDate || txn.actualOutwardDate;
  return normalizeTransactionDateValue(rawDate);
}

function parseUTCDate(dateString: string): Date | null {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildOpeningBalanceRows(
  transactions: any[],
  monthStartStr: string,
  billingEndDateStr: string,
  monthDays: number
) {
  if (!transactions.length || monthDays <= 0) return [];

  const balanceMap = new Map<
    string,
    {
      commodityName: string;
      quantityMT: number;
      bags: number;
      ratePerDay: number;
      lastTxnDate: Date;
    }
  >();

  for (const txn of transactions) {
    const direction = (txn.direction || 'INWARD').toUpperCase();
    const rawQuantity = Number(txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0);
    const quantityMT = direction === 'OUTWARD' ? -Math.abs(rawQuantity) : rawQuantity;

    const rawBags = Number(
      txn.bags ?? txn.bagCount ?? txn.bagsCount ?? txn.bags_count ?? 0
    );
    const bags = direction === 'OUTWARD' ? -Math.abs(rawBags) : rawBags;

    const ratePerDay = Number(
      txn.ratePerMTPerDay ??
        txn.rate ??
        txn.rateFixedAt ??
        txn.ratePerDayPerMT ??
        txn.ratePerDay ??
        txn.dailyRate ??
        0
    );

    const commodityKey = `${txn.commodityId || txn.commodityName || 'unknown'}::${txn.commodityName || 'Unknown'}`;
    const existing = balanceMap.get(commodityKey);

    if (!existing) {
      balanceMap.set(commodityKey, {
        commodityName: txn.commodityName || 'Unknown',
        quantityMT,
        bags,
        ratePerDay: ratePerDay || 0,
        lastTxnDate: txn._transactionDate || new Date(0),
      });
    } else {
      existing.quantityMT += quantityMT;
      existing.bags += bags;
      if (
        txn._transactionDate &&
        existing.lastTxnDate &&
        txn._transactionDate > existing.lastTxnDate
      ) {
        existing.lastTxnDate = txn._transactionDate;
        if (ratePerDay > 0) {
          existing.ratePerDay = ratePerDay;
        }
      } else if (existing.ratePerDay <= 0 && ratePerDay > 0) {
        existing.ratePerDay = ratePerDay;
      }
    }
  }

  return Array.from(balanceMap.values())
    .filter((balance) => balance.quantityMT > 0)
    .map((balance) => ({
      date: monthStartStr,
      startDate: monthStartStr,
      endDate: billingEndDateStr,
      commodityName: balance.commodityName,
      quantityMT: balance.quantityMT,
      quantity: balance.quantityMT,
      bags: balance.bags || '',
      daysTotal: monthDays,
      rentTotal: Number(balance.quantityMT * balance.ratePerDay * monthDays || 0),
      status: 'OPENING_BALANCE',
      rate: balance.ratePerDay,
      direction: 'OPENING BALANCE',
    }));
}

export function transformTransactionsToBillingRows(
  transactions: any[],
  invoiceMonth: string
): any[] {
  try {
    const [yearPart, monthPart] = invoiceMonth.split('-');
    const month = Number(monthPart);
    const year = Number(yearPart);

    if (!year || !month || month < 1 || month > 12) {
      return [];
    }

    const monthStartDateStr = `${yearPart}-${monthPart.padStart(2, '0')}-01`;
    const monthStartDate = new Date(`${monthStartDateStr}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(year, month, 0));
    const monthEndStr = monthEnd.toISOString().split('T')[0];

    const today = new Date();
    const todayMonthKey = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, '0')}`;
    const todayStr = today.toISOString().split('T')[0];
    const billingEndDateStr =
      invoiceMonth === todayMonthKey ? todayStr : monthEndStr;
    const billingEndDate = new Date(`${billingEndDateStr}T00:00:00Z`);

    const monthDays = calculateStorageDays(
      monthStartDateStr,
      billingEndDateStr,
      'ACTIVE'
    );

    const preparedTransactions = (transactions || [])
      .map((txn: any) => {
        const txnDateStr = resolveTransactionDateString(txn);
        const txnDate = parseUTCDate(txnDateStr);

        if (!txnDate) {
          return null;
        }

        return {
          ...txn,
          _transactionDateStr: txnDateStr,
          _transactionDate: txnDate,
        };
      })
      .filter(Boolean) as any[];

    const priorTransactions = preparedTransactions.filter(
      (txn) => txn._transactionDate < monthStartDate
    );

    const currentMonthTransactions = preparedTransactions.filter(
      (txn) =>
        txn._transactionDate >= monthStartDate &&
        txn._transactionDate <= billingEndDate
    );

    const openingBalanceRows = buildOpeningBalanceRows(
      priorTransactions,
      monthStartDateStr,
      billingEndDateStr,
      monthDays
    );

    const transactionRows = currentMonthTransactions
      .map((txn: any) => {
        const direction = (txn.direction || 'INWARD').toUpperCase();
        const txnDateStr = txn._transactionDateStr;
        const rawQuantity = Number(txn.quantityMT ?? txn.quantity ?? txn.qty ?? 0);
        const quantityMT =
          direction === 'OUTWARD' ? -Math.abs(rawQuantity) : rawQuantity;
        const ratePerDay = Number(
          txn.ratePerMTPerDay ??
            txn.rate ??
            txn.rateFixedAt ??
            txn.ratePerDayPerMT ??
            txn.ratePerDay ??
            txn.dailyRate ??
            0
        );
        const bagCountValue =
          txn.bags ??
          txn.bagCount ??
          txn.bagsCount ??
          txn.bagscount ??
          txn.bags_count ??
          '';

        const startDate =
          txnDateStr > monthStartDateStr ? txnDateStr : monthStartDateStr;
        const endDate = billingEndDateStr;
        const days = calculateStorageDays(startDate, endDate, 'ACTIVE');
        const rentTotal = Number(quantityMT * ratePerDay * days || 0);

        if (Number.isNaN(days) || days <= 0) {
          return null;
        }

        return {
          date: txnDateStr,
          startDate,
          endDate,
          commodityName: txn.commodityName || 'Unknown',
          quantityMT,
          quantity: quantityMT,
          bags: bagCountValue,
          daysTotal: days,
          rentTotal,
          status: txn.status || 'COMPLETED',
          rate: ratePerDay,
          direction,
          gatePass: txn.gatePass || txn.gatepass || '',
        };
      })
      .filter(Boolean) as any[];

    return [...openingBalanceRows, ...transactionRows].sort((a: any, b: any) => {
      const aIsOpening = a.status === 'OPENING_BALANCE';
      const bIsOpening = b.status === 'OPENING_BALANCE';
      if (aIsOpening && !bIsOpening) return -1;
      if (bIsOpening && !aIsOpening) return 1;
      if (a.startDate !== b.startDate) {
        return a.startDate.localeCompare(b.startDate);
      }
      if (a.direction !== b.direction) {
        return a.direction.localeCompare(b.direction);
      }
      if (a.commodityName !== b.commodityName) {
        return a.commodityName.localeCompare(b.commodityName);
      }
      return a.quantityMT - b.quantityMT;
    });
  } catch (error) {
    console.error('Error transforming transactions:', error);
    return [];
  }
}

export async function resolveMonthlyInvoiceFromId(
  id: string,
  warehouseId: string | undefined,
  tenantFilter: any,
  invoiceMode?: 'ledger' | 'transactions'
) {
  const db = await getDb();

  const isTransactionMode = invoiceMode === 'transactions';

  const invoiceMaster =
    await findInvoiceMasterByIdentifier(
      db,
      id,
      tenantFilter,
      isTransactionMode ? 'transactions' : undefined
    );

  async function tryBuildTransactionInvoice(invoiceIdentifier: string) {
    return await buildMonthlyInvoiceFromTransactions(
      db,
      invoiceIdentifier,
      warehouseId,
      tenantFilter
    );
  }

  async function tryBuildLedgerInvoice() {
    return await buildMonthlyInvoiceFromLedger(
      db,
      id,
      warehouseId,
      tenantFilter
    );
  }

  if (isTransactionMode) {
    const transactionInvoice = await tryBuildTransactionInvoice(id);
    if (transactionInvoice) {
      return transactionInvoice;
    }
    return await tryBuildLedgerInvoice();
  }

  if (invoiceMaster?.invoiceType === 'transaction') {
    const invoiceIdentifier =
      buildTransactionInvoiceIdentifierFromMaster(invoiceMaster) || id;
    const transactionInvoice = await tryBuildTransactionInvoice(
      invoiceIdentifier
    );
    if (transactionInvoice) {
      return transactionInvoice;
    }
    return await tryBuildLedgerInvoice();
  }

  if (!invoiceMaster && looksLikeTransactionInvoiceIdentifier(id)) {
    const transactionInvoice = await tryBuildTransactionInvoice(id);
    if (transactionInvoice) {
      return transactionInvoice;
    }
  }

  const adjustments = await findInvoiceAdjustments(
    db,
    id,
    invoiceMaster?._id?.toString()
  );

  const additionalChargeItems =
    normalizeAdjustmentItems(adjustments);

  const additionalCharges =
    sumAdjustmentItems(additionalChargeItems);

  if (invoiceMaster) {
    const client = await db.collection('clients').findOne({
      _id: invoiceMaster.clientId,
      ...tenantFilter,
    });

    const warehouse = await db
      .collection('warehouses')
      .findOne({
        _id: invoiceMaster.warehouseId,
        ...tenantFilter,
      });

    if (!client || !warehouse) return null;

    const lineItems = await db
      .collection('invoice_line_items')
      .find({
        invoiceMasterId: invoiceMaster._id,
      })
      .toArray();

    const companyProfile =
      (await resolveInvoiceCompanyProfile(
        db,
        warehouse,
        invoiceMaster
      )) || {};

    let ledgerInvoice: any = null;

    if (
      invoiceMaster.clientId &&
      invoiceMaster.warehouseId &&
      invoiceMaster.invoiceMonth
    ) {
      const ledgerResult =
        await getClientMonthlyLedger(
          invoiceMaster.clientId.toString(),
          invoiceMaster.invoiceMonth,
          invoiceMaster.warehouseId.toString(),
          tenantFilter
        );

      if (
        ledgerResult.success &&
        ledgerResult.data?.months?.length
      ) {
        ledgerInvoice =
          ledgerResult.data.months[0];
      }
    }

    // Fetch transactions for this invoice month
    const transactions =
      await getTransactionsForInvoiceMonth(
        db,
        invoiceMaster.clientId,
        invoiceMaster.warehouseId,
        invoiceMaster.invoiceMonth,
        tenantFilter
      );

    // Convert transactions to billing rows (transaction-based, not ledger-based)
    const billingRows =
      transformTransactionsToBillingRows(
        transactions,
        invoiceMaster.invoiceMonth
      );

    // Calculate total rent from billing rows
    const totalRentFromBilling = billingRows.reduce(
      (sum: number, row: any) =>
        sum + (row.rentTotal || 0),
      0
    );

    const transactionRows = billingRows;
    // DEBUG: show transaction rows count and a small sample to help diagnose rendering
    try {
      console.log('[resolveMonthlyInvoiceFromId] transactionRows:', {
        invoiceId: invoiceMaster?.invoiceId || id,
        clientId: invoiceMaster?.clientId?.toString?.(),
        warehouseId: invoiceMaster?.warehouseId?.toString?.(),
        count: transactionRows.length,
        sample: transactionRows.slice(0, 3),
      });
    } catch (e) {
      console.error('[resolveMonthlyInvoiceFromId] debug log failed', e);
    }

    if (ledgerInvoice) {
      const [yearPart, monthPart] =
        invoiceMaster.invoiceMonth.split('-');

      const month =
        monthNames[Number(monthPart) - 1] ||
        monthPart;

      const year =
        Number(yearPart) ||
        new Date().getFullYear();

      const previousBalance = Number(
        ledgerInvoice.summary.previousBalance ?? 0
      );
      const currentPayments = Number(
        ledgerInvoice.summary.payments ?? 0
      );
      const totalRent =
        transactionRows.length > 0
          ? totalRentFromBilling
          : Number(
              ledgerInvoice.summary.totalRent ??
                invoiceMaster.totalAmount ??
                0
            );
      const newBalance =
        transactionRows.length > 0
          ? totalRent + previousBalance + additionalCharges - currentPayments
          : Number(
              ledgerInvoice.summary.outstanding ??
                invoiceMaster.totalAmount ??
                0
            );

      return {
        bookingId:
          invoiceMaster.clientId?.toString() ||
          id,
        invoiceNumber:
          invoiceMaster.invoiceId || id,
        clientName:
          client.name || client.clientName || '',
        panNumber: resolveClientPan(client),
        gstNumber: resolveClientGst(client),
        month,
        year,
        periods:
          transactionRows.length > 0
            ? transactionRows
            : ledgerInvoice.rows.map(
                (item: any) => ({
                  startDate: item.fromDate || '',
                  endDate: item.toDate || '',
                  quantityMT: Number(item.qty ?? 0),
                  daysTotal: Number(item.days ?? 0),
                  rentTotal: Number(item.rent ?? 0),
                  status:
                    item.status || 'COMPLETED',
                  commodityName:
                    item.commodity || '',
                })
              ),
        transactions: transactionRows,
        warehouseId:
          invoiceMaster.warehouseId?.toString(),
        warehouseName: warehouse.name || '',
        ...companyProfile,
        totalRent,
        previousBalance,
        currentPayments,
        newBalance,
        additionalCharges,
        additionalChargeItems,
        invoiceDate:
          invoiceMaster.generatedAt
            ?.toISOString()
            .split('T')[0] ||
          new Date().toISOString().split('T')[0],
      };
    }

    const [yearPart, monthPart] =
      invoiceMaster.invoiceMonth.split('-');

    const month =
      monthNames[Number(monthPart) - 1] ||
      monthPart;

    const year =
      Number(yearPart) ||
      new Date().getFullYear();

    // Use transaction-based billing if available
    const billingPeriods =
      billingRows.length > 0
        ? billingRows
        : lineItems.map((item: any) => ({
            startDate: item.periodStart || '',
            endDate: item.periodEnd || '',
            quantityMT: Number(
              item.averageQuantityMT ?? 0
            ),
            daysTotal: Number(
              item.daysOccupied ?? 0
            ),
            rentTotal: Number(
              item.totalAmount ?? 0
            ),
            status: item.status || 'COMPLETED',
            commodityName:
              item.commodityName || '',
          }));

    const totalRentFromPeriods = billingPeriods.reduce(
      (sum: number, row: any) =>
        sum + (row.rentTotal || 0),
      0
    );

    return {
      bookingId:
        invoiceMaster._id?.toString() || id,
      invoiceNumber:
        invoiceMaster.invoiceId || id,
      clientName:
        client.name || client.clientName || '',
      panNumber: resolveClientPan(client),
      gstNumber: resolveClientGst(client),
      month,
      year,
      periods: billingPeriods,
      transactions: transactionRows,
      warehouseId:
        invoiceMaster.warehouseId?.toString(),
      warehouseName: warehouse.name || '',
      ...companyProfile,
      totalRent:
        billingRows.length > 0
          ? totalRentFromBilling
          : totalRentFromPeriods,
      previousBalance: 0,
      currentPayments: 0,
      newBalance:
        billingRows.length > 0
          ? totalRentFromBilling
          : Number(
              invoiceMaster.totalAmount ?? 0
            ),
      additionalCharges,
      additionalChargeItems,
      invoiceDate:
        invoiceMaster.generatedAt
          ?.toISOString()
          .split('T')[0] ||
        new Date().toISOString().split('T')[0],
    };
  }

  if (isTransactionMode) {
    return await buildMonthlyInvoiceFromTransactions(
      db,
      id,
      warehouseId,
      tenantFilter
    );
  }

  return await buildMonthlyInvoiceFromLedger(
    db,
    id,
    warehouseId,
    tenantFilter
  );
}