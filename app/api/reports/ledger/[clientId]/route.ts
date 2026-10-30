import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenantFilterForMongo } from '@/lib/ownership';
import { getInternalLedgerData } from '@/app/actions/internal-ledger';
import { ObjectId } from 'mongodb';
import { sanitizeClientName, isMongoObjectId } from '@/lib/ledger-engine';
import type { Transaction, Payment, MatchedRecord } from '@/lib/ledger-engine';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const tenantFilter = getTenantFilterForMongo(session);
    const activeRecordFilter = {
      deletedAt: { $exists: false },
      status: { $nin: ['DELETED', 'CANCELLED'] },
    };

    const url = new URL(req.url);
    const rawClientId = url.pathname.split('/').pop() || '';
    if (!rawClientId) {
      return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 });
    }
    // Decode URI component in case clientId was URL-encoded by the client
    const trimmedClientId = decodeURIComponent(rawClientId).trim();
    if (!trimmedClientId) {
      return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 });
    }

    const isValidObjectId = ObjectId.isValid(trimmedClientId) && /^[a-fA-F0-9]{24}$/.test(trimmedClientId);
    console.log(`[LEDGER API] clientId=${trimmedClientId} isValidObjectId=${isValidObjectId}`);

    const db = await getDb();
    const accountId = trimmedClientId;

    // Delegate to getInternalLedgerData which has full client resolution & audit trail
    const ledgerSummary = await getInternalLedgerData(accountId, tenantFilter);

    return NextResponse.json(
      { success: true, data: ledgerSummary },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[LEDGER API] GET /api/reports/ledger/[clientId] error:', error?.message || error);
    return NextResponse.json(
      { success: false, message: error?.message || 'Server error' },
      { status: 500 }
    );
  }
}
