import { isDeepStrictEqual } from 'node:util';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import connectToDatabase from '@/lib/mongoose';
import ColdStorageOfflineDraft, {
  type ColdStorageOfflineDraftType,
  type IColdStorageOfflineDraft,
} from '@/lib/models/ColdStorageOfflineDraft';
import { isTrustedRequestOrigin } from '@/lib/offline-origin';

export const dynamic = 'force-dynamic';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedTypes: ColdStorageOfflineDraftType[] = ['COLD_INWARD', 'COLD_OUTWARD'];
const maximumRequestBytes = 5 * 1024 * 1024;

function canCreateType(session: Session, type: ColdStorageOfflineDraftType) {
  return hasPermission(session, type === 'COLD_INWARD' ? 'inward' : 'outward', 'create');
}

function serializeDraft(draft: IColdStorageOfflineDraft | Record<string, unknown>) {
  const value = draft as IColdStorageOfflineDraft;
  return {
    transactionId: String(value._id),
    type: value.type,
    payload: value.payload,
    status: value.status,
    revision: value.revision,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | NextResponse> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumRequestBytes) {
    return NextResponse.json({ error: 'Offline draft is too large.' }, { status: 413 });
  }

  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid offline draft request.' }, { status: 400 });
    }
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid offline draft request.' }, { status: 400 });
  }
}

function isResponse(value: Record<string, unknown> | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

function isDuplicateKeyError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 11000;
}

function serializeForUser(draft: IColdStorageOfflineDraft) {
  return serializeDraft(draft);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userAllowedTypes = allowedTypes.filter((type) => canCreateType(session, type));
    await connectToDatabase();
    const drafts = userAllowedTypes.length > 0
      ? await ColdStorageOfflineDraft.find({
        userId: session.user.id,
        status: 'DRAFT',
        type: { $in: userAllowedTypes },
      }).sort({ updatedAt: -1 }).lean()
      : [];
    const submittedDrafts = userAllowedTypes.length > 0
      ? await ColdStorageOfflineDraft.find({
        userId: session.user.id,
        status: 'SUBMITTED',
        type: { $in: userAllowedTypes },
      }).select({ _id: 1 }).lean()
      : [];

    return NextResponse.json(
      {
        allowedTypes: userAllowedTypes,
        drafts: drafts.map(serializeForUser),
        submittedTransactionIds: submittedDrafts.map((draft) => String(draft._id)),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('Unable to load shared offline drafts:', error);
    return NextResponse.json(
      { error: 'Unable to load shared offline drafts.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function PUT(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedBody = await readJsonBody(request);
    if (isResponse(parsedBody)) return parsedBody;

    const { transactionId, type, payload, expectedRevision } = parsedBody;
    if (
      typeof transactionId !== 'string' ||
      !uuidPattern.test(transactionId) ||
      typeof type !== 'string' ||
      !allowedTypes.includes(type as ColdStorageOfflineDraftType) ||
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      return NextResponse.json({ error: 'Invalid offline draft.' }, { status: 400 });
    }
    if (
      expectedRevision !== undefined &&
      (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 1)
    ) {
      return NextResponse.json({ error: 'Invalid offline draft revision.' }, { status: 400 });
    }

    const draftType = type as ColdStorageOfflineDraftType;
    if (!canCreateType(session, draftType)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();
    const userId = session.user.id;
    const existing = await ColdStorageOfflineDraft.findById(transactionId).lean();

    if (existing) {
      if (String(existing.userId) !== userId || existing.type !== draftType || existing.status !== 'DRAFT') {
        return NextResponse.json({ error: 'This draft can no longer be updated.' }, { status: 409 });
      }

      if (isDeepStrictEqual(existing.payload, payload)) {
        return NextResponse.json(
          { success: true, draft: serializeForUser(existing) },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (expectedRevision !== existing.revision) {
        return NextResponse.json(
          {
            error: 'This draft changed on another device. Refresh the shared draft before saving.',
            code: 'REVISION_CONFLICT',
            revision: existing.revision,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      const savedDraft = await ColdStorageOfflineDraft.findOneAndUpdate(
        {
          _id: transactionId,
          userId,
          type: draftType,
          status: 'DRAFT',
          revision: expectedRevision,
        },
        { $set: { payload }, $inc: { revision: 1 } },
        { new: true, runValidators: true },
      ).lean();

      if (!savedDraft) {
        return NextResponse.json(
          { error: 'This draft changed on another device. Refresh the shared draft before saving.', code: 'REVISION_CONFLICT' },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      return NextResponse.json(
        { success: true, draft: serializeForUser(savedDraft) },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    if (expectedRevision !== undefined) {
      return NextResponse.json(
        { error: 'This draft is no longer available. Refresh shared drafts before saving.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let savedDraft;
    try {
      savedDraft = await ColdStorageOfflineDraft.create({
        _id: transactionId,
        userId,
        type: draftType,
        payload,
        status: 'DRAFT',
        revision: 1,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const duplicate = await ColdStorageOfflineDraft.findById(transactionId).lean();
      if (
        duplicate &&
        String(duplicate.userId) === userId &&
        duplicate.type === draftType &&
        duplicate.status === 'DRAFT' &&
        isDeepStrictEqual(duplicate.payload, payload)
      ) {
        return NextResponse.json(
          { success: true, draft: serializeForUser(duplicate) },
          { headers: { 'Cache-Control': 'no-store' } },
        );
      }
      return NextResponse.json({ error: 'This draft ID is already in use.' }, { status: 409 });
    }

    return NextResponse.json(
      { success: true, draft: serializeForUser(savedDraft) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return NextResponse.json({ error: 'This draft ID is already in use.' }, { status: 409 });
    }
    console.error('Unable to save shared offline draft:', error);
    return NextResponse.json(
      { error: 'Unable to save shared offline draft.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isTrustedRequestOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedBody = await readJsonBody(request);
    if (isResponse(parsedBody)) return parsedBody;
    const transactionId = parsedBody.transactionId;
    if (typeof transactionId !== 'string' || !uuidPattern.test(transactionId)) {
      return NextResponse.json({ error: 'Invalid offline draft ID.' }, { status: 400 });
    }

    await connectToDatabase();
    const draft = await ColdStorageOfflineDraft.findById(transactionId);
    if (!draft || String(draft.userId) !== session.user.id || draft.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    }
    if (!canCreateType(session, draft.type)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await draft.deleteOne();
    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('Unable to delete shared offline draft:', error);
    return NextResponse.json(
      { error: 'Unable to delete shared offline draft.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
