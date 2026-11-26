import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { createColdInwardBulk } from '@/app/actions/cold-inward-actions';
import { createBatchColdOutwards } from '@/app/actions/cold-outward-actions';
import ColdStorageOfflineDraft from '@/lib/models/ColdStorageOfflineDraft';
import { isTrustedRequestOrigin } from '@/lib/offline-origin';

export const dynamic = 'force-dynamic';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    if (!isTrustedRequestOrigin(request)) {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    if (
      typeof body.transactionId !== 'string' ||
      !uuidPattern.test(body.transactionId) ||
      !body.payload ||
      typeof body.payload !== 'object'
    ) {
      return NextResponse.json({ error: 'Invalid offline transaction.' }, { status: 400 });
    }

    let result;
    if (body.type === 'COLD_INWARD') {
      if (!hasPermission(session, 'inward', 'create')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      result = await createColdInwardBulk({
        ...body.payload,
        offlineTransactionId: body.transactionId,
      });
    } else if (body.type === 'COLD_OUTWARD') {
      if (!hasPermission(session, 'outward', 'create')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      result = await createBatchColdOutwards({
        ...body.payload,
        offlineTransactionId: body.transactionId,
        batchId: body.transactionId,
      });
    } else {
      return NextResponse.json({ error: 'Unsupported offline transaction type.' }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Server rejected the offline transaction.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    await ColdStorageOfflineDraft.findOneAndUpdate(
      { _id: body.transactionId, userId: session.user.id, status: 'DRAFT' },
      { $set: { status: 'SUBMITTED' } },
    );

    return NextResponse.json(
      { success: true, data: result.data },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Offline transaction synchronization failed:', error);
    return NextResponse.json(
      { error: 'Offline transaction synchronization failed.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
