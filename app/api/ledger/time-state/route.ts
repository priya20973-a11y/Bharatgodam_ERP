/**
 * API Route: Time-State Ledger Operations
 * POST: Generate and save time-state ledger entries
 * GET: Retrieve time-state entries for a client account
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ILedgerTimeState } from '@/types/schemas';
import { generateTimeStateLedger } from '@/lib/ledger-time-state-engine';

const LEDGER_TIME_STATE_COLLECTION = 'ledger_time_state';

/**
 * GET: Retrieve time-state entries for an account
 * Query params: accountId (bookingId)
 */
async function handleGet(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    const db = await getDb();

    // Retrieve all time-state entries for this account, sorted by period start date
    const entries = await db
      .collection<ILedgerTimeState>(LEDGER_TIME_STATE_COLLECTION)
      .find({ accountId })
      .sort({ periodStartDate: 1 })
      .toArray();

    return NextResponse.json({
      success: true,
      accountId,
      totalEntries: entries.length,
      entries,
    });
  } catch (error) {
    console.error('Error retrieving time-state entries:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve time-state entries' },
      { status: 500 }
    );
  }
}

/**
 * POST: Generate and save time-state entries from transactions
 * Body: {
 *   accountId: string (bookingId),
 *   clientName: string,
 *   transactions: Transaction[]
 * }
 */
async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, clientName, transactions } = body;

    if (!accountId || !clientName || !transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'accountId, clientName, and transactions array are required' },
        { status: 400 }
      );
    }

    // Generate time-state ledger from transactions
    const timeStateLedger = generateTimeStateLedger(transactions, clientName);

    const db = await getDb();
    const collection = db.collection<ILedgerTimeState>(LEDGER_TIME_STATE_COLLECTION);

    // Delete existing entries for this account (replace with new calculation)
    await collection.deleteMany({ accountId });

    // Insert new time-state entries
    const entriesToInsert: ILedgerTimeState[] = timeStateLedger.timeStatePeriods.map(period => ({
      accountId,
      periodStartDate: period.periodStartDate,
      periodEndDate: period.periodEndDate,
      quantityMT: period.quantityMT,
      status: period.status,
      reasonForChange: period.reasonForChange,
      affectedTransaction: period.transaction
        ? {
            transactionId: period.transaction.id,
            direction: period.transaction.direction,
            quantity: period.transaction.quantity,
            date: period.transaction.date,
          }
        : undefined,
      ratePerDayPerMT: period.ratePerDayPerMT,
      rentCalculated: period.rentCalculated,
      historicalRecord: isPastPeriod(period.periodEndDate),
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    if (entriesToInsert.length > 0) {
      const result = await collection.insertMany(entriesToInsert);
      
      return NextResponse.json({
        success: true,
        accountId,
        entriesCreated: Object.keys(result.insertedIds).length,
        timeStateLedger,
      });
    } else {
      return NextResponse.json({
        success: true,
        accountId,
        entriesCreated: 0,
        message: 'No transactions to process',
      });
    }
  } catch (error) {
    console.error('Error processing time-state ledger:', error);
    return NextResponse.json(
      { error: 'Failed to process time-state ledger' },
      { status: 500 }
    );
  }
}

/**
 * Check if a period is in the past
 */
function isPastPeriod(periodEndDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(periodEndDate);
  endDate.setHours(0, 0, 0, 0);
  return endDate < today;
}

export async function GET(request: NextRequest) {
  return handleGet(request);
}

export async function POST(request: NextRequest) {
  return handlePost(request);
}
