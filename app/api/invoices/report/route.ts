import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import { buildMonthlyInvoiceFromTransactions } from '@/app/api/invoice/utils';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('clientId')?.trim() || '';
    const warehouseId = url.searchParams.get('warehouseId')?.trim() || '';
    const invoiceMonth = url.searchParams.get('invoiceMonth')?.trim() || '';

    if (!clientId || !warehouseId || !invoiceMonth) {
      return NextResponse.json(
        { success: false, message: 'clientId, warehouseId and invoiceMonth are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const tenantFilter = getTenantFilterForMongo(session);

    const master = await db.collection('invoice_master').findOne({
      clientId: new ObjectId(clientId),
      warehouseId: new ObjectId(warehouseId),
      invoiceMonth,
      ...tenantFilter,
    });

    let lineItems = master
      ? await db.collection('invoice_line_items').find({ invoiceMasterId: master._id }).toArray()
      : [];

    let responseMaster = master
      ? {
          ...master,
          totalAmount: master.totalAmount,
        }
      : null;

    if (
      master?.invoiceType === 'transaction' ||
      lineItems.length === 0
    ) {
      const invoiceId = `${clientId}-${invoiceMonth}-${warehouseId}`;
      const transactionInvoice = await buildMonthlyInvoiceFromTransactions(
        db,
        invoiceId,
        warehouseId,
        tenantFilter
      );

      if (transactionInvoice) {
        lineItems = (transactionInvoice.periods || []).map((period: any) => ({
          commodityId: period.commodityId,
          commodityName: period.commodityName || '',
          daysOccupied: Number(period.daysTotal || 0),
          averageQuantityMT: Number(period.quantityMT || 0),
          ratePerMTPerDay: Number(period.rate || 0),
          totalAmount: Number(period.rentTotal || 0),
          periodStart: period.startDate || '',
          periodEnd: period.endDate || '',
          status: period.status || 'COMPLETED',
        }));

        if (!master && transactionInvoice.invoiceId) {
          const persistedMaster = await db.collection('invoice_master').findOne({
            invoiceId: transactionInvoice.invoiceId,
            ...tenantFilter,
          });

          if (persistedMaster) {
            responseMaster = {
              ...persistedMaster,
              totalAmount: persistedMaster.totalAmount,
            };
            lineItems = await db
              .collection('invoice_line_items')
              .find({ invoiceMasterId: persistedMaster._id })
              .toArray();
          }
        }

        if (!responseMaster) {
          responseMaster = {
            clientId: new ObjectId(clientId),
            warehouseId: new ObjectId(warehouseId),
            invoiceMonth,
            invoiceId: transactionInvoice.invoiceId,
            invoiceType: 'transaction',
            totalAmount: Number(transactionInvoice.totalRent || 0),
            status: 'DRAFT',
            generatedAt: new Date(transactionInvoice.invoiceDate || new Date().toISOString()),
            dueDate: transactionInvoice.invoiceDate || new Date().toISOString().split('T')[0],
            createdAt: new Date(),
            updatedAt: new Date(),
          } as any;
        } else {
          responseMaster.totalAmount = Number(transactionInvoice.totalRent || 0);
          responseMaster.invoiceType = 'transaction';
        }
      }
    }

    return NextResponse.json({ success: true, data: { master: responseMaster, lineItems } }, { status: 200 });
  } catch (error: any) {
    console.error('GET /api/invoices/report error:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to fetch invoice report' },
      { status: 500 }
    );
  }
}
