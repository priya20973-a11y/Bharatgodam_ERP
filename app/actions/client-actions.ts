'use server';

import mongoose from 'mongoose';
import connectToDatabase from '@/lib/mongoose';
import Client from '@/lib/models/Client';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';

const mobileRegex = /^[0-9]{10}$/;
const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/i;
const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/i;
const aadhaarRegex = /^[0-9]{12}$/;

const isNAValue = (value?: string) => value?.trim().toUpperCase() === 'NA';
const normalizeAadhaarValue = (value: string) => value.replace(/\s+/g, '');
const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || null;

function validateClientData(data: {
  mobile?: string;
  panNumber?: string;
  aadharNumber?: string;
  gstNumber?: string;
}) {
  if (data.mobile !== undefined) {
    const mobile = data.mobile.trim();
    if (!mobile) return 'Mobile number is required';
    if (!isNAValue(mobile) && !mobileRegex.test(mobile)) return 'Mobile number must be 10 digits or NA';
  }

  if (data.panNumber !== undefined) {
    const pan = data.panNumber.trim();
    if (!pan) return 'PAN number is required';
    if (!isNAValue(pan) && !panRegex.test(pan)) return 'PAN number must be valid or NA';
  }

  if (data.aadharNumber !== undefined) {
    const aadhar = data.aadharNumber.trim();
    if (!aadhar) return 'Aadhaar number is required';
    if (!isNAValue(aadhar) && !aadhaarRegex.test(normalizeAadhaarValue(aadhar))) return 'Aadhaar number must be 12 digits or NA';
  }

  if (data.gstNumber !== undefined) {
    const gst = data.gstNumber.trim();
    if (!gst) return 'GSTIN is required';
    if (!isNAValue(gst) && !gstRegex.test(gst)) return 'GSTIN must be valid or NA';
  }

  return null;
}

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
  commodityIds?: string[];
}) {
  await connectToDatabase();
  try {
    const validationError = validateClientData(data);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const session = await requireSession();
    const nameValue = data.name.trim();
    const nameKey = nameValue.toUpperCase();

    const email = normalizeEmail(session.user.email);
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email
          ? [{ $and: [
              { $or: [{ userId: { $exists: false } }, { userId: null }] },
              { userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }
            ] }]
          : [])
      ]
    };

    const existingClient = await Client.findOne({
      $and: [
        ownerFilter,
        {
          $or: [
            { nameKey },
            { name: { $regex: new RegExp(`^${nameValue.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }
          ]
        }
      ]
    });

    if (existingClient) {
      return { success: false, error: 'Client name already exists for your account' };
    }

    const client = await Client.create(appendOwnership({ ...data, name: nameValue, nameKey }, session));
    revalidatePath('/dashboard/clients');
    return { success: true, data: JSON.parse(JSON.stringify(client)) };
  } catch (error: unknown) {
    const message = error instanceof Error && /duplicate key/i.test(error.message)
      ? 'Client name already exists for your account'
      : error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function updateClient(id: string, data: Partial<{
  name: string;
  nameKey?: string;
  address: string;
  clientType: string;
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
  commodityIds?: string[];
}>) {
  await connectToDatabase();
  try {
    const validationError = validateClientData(data);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const session = await requireSession();
    if (data.name) {
      const nameValue = data.name.trim();
      const nameKey = nameValue.toUpperCase();
      data.name = nameValue;
      data.nameKey = nameKey;

      const email = normalizeEmail(session.user.email);
      const ownerFilter: any = {
        $or: [
          { userId: session.user.id },
          ...(email
            ? [{ $and: [
                { $or: [{ userId: { $exists: false } }, { userId: null }] },
                { userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }
              ] }]
            : [])
        ]
      };
      const existingClient = await Client.findOne({
        _id: { $ne: id },
        $and: [
          ownerFilter,
          {
            $or: [
              { nameKey },
              { name: { $regex: new RegExp(`^${nameValue.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }
            ]
          }
        ]
      });

      if (existingClient) {
        return { success: false, error: 'Client name already exists for your account' };
      }
    }

    const client = await Client.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      data,
      { new: true }
    );
    revalidatePath('/dashboard/clients');
    return { success: true, data: JSON.parse(JSON.stringify(client)) };
  } catch (error: unknown) {
    const message = error instanceof Error && /duplicate key/i.test(error.message)
      ? 'Client name already exists for your account'
      : error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
