import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import type { Session } from 'next-auth';

export const ADMIN_ROLE = 'ADMIN';
export const WSP_ROLE = 'WSP';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export function isAdmin(session: Session | null) {
  const role = session?.user?.role?.toString().toUpperCase();
  return role === ADMIN_ROLE || role === 'SUPER_ADMIN';
}

export function isWsp(session: Session | null) {
  return session?.user?.role?.toString().toUpperCase() === WSP_ROLE;
}

export function getTenantFilter(session: Session | null) {
  if (!session?.user?.id) return { $expr: { $eq: [1, 0] } };
  if (isAdmin(session)) return {};

  const filter: any = {
    $or: [{ userId: session.user.id }]
  };

  const email = normalizeEmail(session.user.email);
  if (email) {
    filter.$or.push({ userEmail: { $regex: new RegExp(`^${escapeRegExp(email)}$`, 'i') } });
  }

  return filter;
}

export function getTenantFilterForMongo(session: Session | null) {
  if (!session?.user?.id) return { $expr: { $eq: [1, 0] } };
  if (isAdmin(session)) return {};

  const filter: any = { $or: [] };
  const email = normalizeEmail(session.user.email);

  try {
    filter.$or.push({ userId: new ObjectId(String(session.user.id)) });
  } catch {
    filter.$or.push({ userId: session.user.id });
  }

  if (email) {
    filter.$or.push({ userEmail: { $regex: new RegExp(`^${escapeRegExp(email)}$`, 'i') } });
  }

  return filter;
}

export function appendOwnership(doc: any, session: Session | null) {
  if (!session?.user?.id) return doc;
  return {
    ...doc,
    userId: session.user.id,
    userEmail: normalizeEmail(session.user.email),
  };
}

export function appendOwnershipForMongo(doc: any, session: Session | null) {
  if (!session?.user?.id) return doc;
  return {
    ...doc,
    userId: new ObjectId(String(session.user.id)),
    userEmail: normalizeEmail(session.user.email),
  };
}

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session;
}
