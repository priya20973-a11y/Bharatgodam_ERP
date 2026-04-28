import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import type { Session } from 'next-auth';

export const ADMIN_ROLE = 'ADMIN';
export const WSP_ROLE = 'WSP';

export function isAdmin(session: Session | null) {
  return session?.user?.role?.toString().toUpperCase() === ADMIN_ROLE;
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

  if (session.user.email) {
    filter.$or.push({ userEmail: session.user.email });
  }

  return filter;
}

export function getTenantFilterForMongo(session: Session | null) {
  if (!session?.user?.id) return { $expr: { $eq: [1, 0] } };
  if (isAdmin(session)) return {};

  const filter: any = {
    $or: [{ userId: new ObjectId(String(session.user.id)) }]
  };

  if (session.user.email) {
    filter.$or.push({ userEmail: session.user.email });
  }

  return filter;
}

export function appendOwnership(doc: any, session: Session | null) {
  if (!session?.user?.id) return doc;
  return {
    ...doc,
    userId: session.user.id,
    userEmail: session.user.email || null,
  };
}

export function appendOwnershipForMongo(doc: any, session: Session | null) {
  if (!session?.user?.id) return doc;
  return {
    ...doc,
    userId: new ObjectId(String(session.user.id)),
    userEmail: session.user.email || null,
  };
}

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session;
}
