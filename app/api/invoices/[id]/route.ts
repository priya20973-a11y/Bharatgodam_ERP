import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import {
  requireSession,
  getTenantFilterForMongo,
} from '@/lib/ownership';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();

    if (!session?.user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    const tenantFilter =
      getTenantFilterForMongo(session);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invoice ID is required',
        },
        { status: 400 }
      );
    }

    const db = await getDb();

    const query: any = {
      ...tenantFilter,
    };

    if (ObjectId.isValid(id)) {
      query.clientId = new ObjectId(id);
    } else {
      query.clientId = id;
    }

    const transactions = await db
      .collection('transactions')
      .find(query)
      .sort({ createdAt: 1 })
      .toArray();

    // --------------------------------------------------
    // FIXED TYPE ERROR HERE
    // --------------------------------------------------
    const normalizeTransactionKey = (
      txn: any
    ) => {
      const clientKey = (
        txn.clientId ||
        txn.clientName ||
        ''
      )
        .toString()
        .trim()
        .toUpperCase();

      const commodityKey = (
        txn.commodityName || ''
      )
        .toString()
        .trim()
        .toUpperCase();

      const warehouseKey = (
        txn.warehouseId || ''
      )
        .toString()
        .trim()
        .toUpperCase();

      const stackKey = (
        txn.stackName || ''
      )
        .toString()
        .trim()
        .toUpperCase();

      return [
        clientKey,
        commodityKey,
        warehouseKey,
        stackKey,
      ].join('|');
    };

    const groupedMap = new Map<
      string,
      any
    >();

    transactions.forEach((txn: any) => {
      const key =
        normalizeTransactionKey(txn);

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          clientId:
            txn.clientId || '',
          clientName:
            txn.clientName || '',
          warehouseId:
            txn.warehouseId || '',
          warehouseName:
            txn.warehouseName || '',
          commodityName:
            txn.commodityName || '',
          stackName:
            txn.stackName || '',
          inwardQty: 0,
          outwardQty: 0,
          balanceQty: 0,
          transactions: [],
        });
      }

      const group =
        groupedMap.get(key);

      const qty = Number(
        txn.quantity ||
          txn.qty ||
          0
      );

      const type = (
        txn.transactionType ||
        txn.type ||
        ''
      )
        .toString()
        .toUpperCase();

      if (
        type === 'INWARD' ||
        type === 'DEPOSIT'
      ) {
        group.inwardQty += qty;
      } else if (
        type === 'OUTWARD' ||
        type === 'WITHDRAWAL'
      ) {
        group.outwardQty += qty;
      }

      group.balanceQty =
        group.inwardQty -
        group.outwardQty;

      group.transactions.push({
        ...txn,
        quantity: qty,
      });
    });

    const ledgerData = Array.from(
      groupedMap.values()
    );

    return NextResponse.json({
      success: true,
      data: ledgerData,
    });
  } catch (error) {
    console.error(
      '[GET /api/reports/ledger/[clientId]] error:',
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          'Failed to fetch ledger report',
      },
      { status: 500 }
    );
  }
}