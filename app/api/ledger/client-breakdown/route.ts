import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { getTenantFilterForMongo, requireSession } from '@/lib/ownership';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function calculateLedgerEntryRent(entry: any) {
  if (entry?.rentCalculated != null) {
    return Number(entry.rentCalculated) || 0;
  }

  if (entry?.rent != null) {
    return Number(entry.rent) || 0;
  }

  const quantityMT = Number(entry?.quantityMT || 0);
  const ratePerMTPerDay = Number(entry?.ratePerMTPerDay || 0);
  const startDate = entry?.periodStartDate ? new Date(entry.periodStartDate) : null;
  const endDate = entry?.periodEndDate ? new Date(entry.periodEndDate) : startDate;

  if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  const days = Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1;
  return quantityMT * ratePerMTPerDay * Math.max(days, 1);
}

async function getInvoiceMasterClientBreakdown(db: any, clients: any[], tenantFilter: any) {
  const totalRentResult = await db.collection('invoice_master').aggregate([
    { $match: tenantFilter },
    {
      $group: {
        _id: null,
        totalRent: {
          $sum: {
            $ifNull: ['$totalAmount', { $ifNull: ['$totalRent', 0] }]
          }
        }
      }
    }
  ]).toArray();

  const totalRent = totalRentResult[0]?.totalRent ?? 0;

  const clientBreakdown = await Promise.all(
    clients.map(async (client) => {
      const clientId = client._id;

      const outstandingResult = await db.collection('invoice_master').aggregate([
        { $match: { clientId, ...tenantFilter } },
        {
          $project: {
            totalAmount: 1,
            paidAmount: { $ifNull: ['$paidAmount', 0] },
            pendingAmount: {
              $max: [
                { $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] },
                0
              ]
            },
            status: 1
          }
        },
        { $match: { status: { $ne: 'PAID' }, pendingAmount: { $gt: 0 } } },
        { $group: { _id: null, totalOutstanding: { $sum: '$pendingAmount' } } }
      ]).toArray();

      const clientOutstanding = outstandingResult[0]?.totalOutstanding ?? 0;

      const receivedResult = await db.collection('payments').aggregate([
        { $match: { clientId, status: 'COMPLETED' } },
        { $group: { _id: null, totalReceived: { $sum: '$amount' } } }
      ]).toArray();

      const clientReceived = receivedResult[0]?.totalReceived ?? 0;

      return {
        clientId: clientId.toString(),
        clientName: client.name,
        outstanding: Math.round(clientOutstanding * 100) / 100,
        received: Math.round(clientReceived * 100) / 100,
        balance: Math.round((clientOutstanding - clientReceived) * 100) / 100
      };
    })
  );

  const filteredBreakdown = clientBreakdown.filter(item => item.outstanding > 0 || item.received > 0);
  const totalOutstanding = filteredBreakdown.reduce((sum, item) => sum + item.outstanding, 0);
  const totalReceived = filteredBreakdown.reduce((sum, item) => sum + item.received, 0);

  return {
    totalRent,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    clientBreakdown: filteredBreakdown
  };
}

async function getLedgerEntryClientBreakdown(db: any, clients: any[], tenantFilter: any) {
  const clientIds = clients.map(client => client._id);
  const ledgerEntries = await db.collection('ledger_entries').find({ clientId: { $in: clientIds }, ...tenantFilter }).toArray();

  const payments = await db.collection('payments').aggregate([
    { $match: { clientId: { $in: clientIds }, status: 'COMPLETED', ...tenantFilter } },
    { $group: { _id: '$clientId', totalReceived: { $sum: '$amount' } } }
  ]).toArray();

  const paymentsByClient = new Map<string, number>(payments.map((payment: { _id: any; totalReceived: number }) => [payment._id.toString(), Number(payment.totalReceived || 0)]));

  const rentByClient = new Map<string, number>();
  let totalRent = 0;

  ledgerEntries.forEach((entry: any) => {
    const clientIdString = entry.clientId?.toString();
    if (!clientIdString) return;
    const rent = calculateLedgerEntryRent(entry);
    totalRent += rent;
    rentByClient.set(clientIdString, (rentByClient.get(clientIdString) || 0) + rent);
  });

  const clientBreakdown = clients.map(client => {
    const clientIdString = client._id.toString();
    const clientRent: number = rentByClient.get(clientIdString) || 0;
    const clientReceived: number = paymentsByClient.get(clientIdString) || 0;
    const clientOutstanding = Math.max(0, clientRent - clientReceived);

    return {
      clientId: clientIdString,
      clientName: client.name,
      outstanding: Math.round(clientOutstanding * 100) / 100,
      received: Math.round(clientReceived * 100) / 100,
      balance: Math.round((clientRent - clientReceived) * 100) / 100
    };
  }).filter(item => item.outstanding > 0 || item.received > 0);

  const totalOutstanding = clientBreakdown.reduce((sum, item) => sum + item.outstanding, 0);
  const totalReceived = clientBreakdown.reduce((sum, item) => sum + item.received, 0);

  return {
    totalRent: Math.round(totalRent * 100) / 100,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    clientBreakdown
  };
}

export async function GET() {
  const session = await requireSession();
  const db = await getDb();
  const tenantFilter = getTenantFilterForMongo(session);

  try {
    const clients = await db.collection('clients').find({ status: 'ACTIVE', ...tenantFilter }).toArray();
    const invoiceMasterExists = await db.collection('invoice_master').findOne({ ...tenantFilter });

    const breakdownResult = invoiceMasterExists
      ? await getInvoiceMasterClientBreakdown(db, clients, tenantFilter)
      : await getLedgerEntryClientBreakdown(db, clients, tenantFilter);

    breakdownResult.clientBreakdown.sort((a, b) => b.outstanding - a.outstanding);

    return NextResponse.json(breakdownResult);
  } catch (error: any) {
    console.error('Error fetching client breakdown:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
