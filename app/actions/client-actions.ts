'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import Client from '@/lib/models/Client';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';

type LegacyClient = {
  _id: string;
  clientName?: string;
  name?: string;
  clientLocation?: string;
  address?: string;
  clientType?: string;
  contactInfo?: {
    mobile?: string;
    phone?: string;
  };
};

export async function getClients() {
  await connectToDatabase();
  const session = await requireSession();
  const clients = await Client.find({ ...getTenantFilter(session) }).sort({ name: 1 });

  if (!clients.length) {
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }
    
    const rawClients = await mongoose.connection.db
      .collection('client_accounts')
      .find({ ...getTenantFilter(session) })
      .sort({ clientName: 1 })
      .toArray();

    const legacyClients = rawClients.map((client: any) => ({
      _id: client._id.toString(),
      name: client.clientName || client.name || 'Unknown',
      address: client.clientLocation || client.address || '',
      clientType: client.clientType || 'FARMER',
      mobile: client.contactInfo?.mobile || client.contactInfo?.phone || '',
      userId: null,
      userEmail: null,
      addedBy: 'System'
    }));

    return JSON.parse(JSON.stringify(legacyClients));
  }

  const db = await getDb();
  const userIds = clients.map(client => client.userId).filter((id): id is any => !!id);
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email }]));

  return JSON.parse(JSON.stringify(clients.map(client => {
    const userId = client.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const addedBy = userInfo?.fullName || userInfo?.email || (client.userId ? 'Unknown' : 'System');
    
    return {
      ...client.toObject?.() || client,
      addedBy,
    };
  })));
}

export async function createClient(data: {
  name: string;
  address: string;
  clientType: 'FARMER' | 'FPO' | 'COMPANY';
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
}) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const client = await Client.create(appendOwnership(data, session));
    revalidatePath('/dashboard/clients');
    return { success: true, data: JSON.parse(JSON.stringify(client)) };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function updateClient(id: string, data: Partial<{
  name: string;
  address: string;
  clientType: string;
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
}>) {
  await connectToDatabase();
  try {
    const session = await requireSession();
    const client = await Client.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      data,
      { new: true }
    );
    revalidatePath('/dashboard/clients');
    return { success: true, data: JSON.parse(JSON.stringify(client)) };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
