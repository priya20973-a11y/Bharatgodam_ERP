'use server';

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectToDatabase from '@/lib/mongoose';
import Client from '@/lib/models/Client';
import Inward from '@/lib/models/Inward';
import Outward from '@/lib/models/Outward';
import { revalidatePath } from 'next/cache';
import { appendOwnership, getTenantFilter, requireSession } from '@/lib/ownership';
import { getDb } from '@/lib/mongodb';
import { requireWspActionPermission } from '@/lib/server-wsp-permissions';
import { logActivity } from '@/lib/cold-logger';

const DEFAULT_CLIENT_PASSWORD = '123456';

function generateClientLoginEmail(name: string, clientType: string) {
  const safeName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Date.now().toString().slice(-6);
  return `${safeName || 'client'}-${clientType.toLowerCase()}-${suffix}@bharatgodam.com`;
}

async function createClientUserAccount(db: any, clientName: string, clientType: string, mobile: string, address: string, gstNumber: string, preferredEmail?: string) {
  const loginEmail = preferredEmail && preferredEmail.trim().length > 0 ? preferredEmail.trim().toLowerCase() : generateClientLoginEmail(clientName, clientType);
  // Ensure no existing user with same email
  const existing = await db.collection('users').findOne({ email: loginEmail });
  if (existing) {
    throw new Error('A user with that email already exists. Choose a different email');
  }

  const hashedPassword = await bcrypt.hash(DEFAULT_CLIENT_PASSWORD, 12);
  const userPayload = {
    fullName: clientName,
    email: loginEmail,
    password: hashedPassword,
    companyName: clientName,
    phoneNumber: mobile,
    warehouseLocation: address,
    gstNumber,
    role: clientType,
    status: 'ACTIVE',
    isNewRegistration: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection('users').insertOne(userPayload);
  return { userId: result.insertedId, userEmail: loginEmail, password: DEFAULT_CLIENT_PASSWORD };
}

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
  commodityIds?: string[];
}, isColdStorage: boolean = false) {
  if (isColdStorage && (!data.commodityIds || data.commodityIds.length === 0)) {
    return 'Please assign at least one commodity to the client.';
  }
  if (data.mobile !== undefined) {
    const mobile = data.mobile.trim();
    if (isColdStorage) {
      if (!mobile) return 'Mobile number is required';
      if (isNAValue(mobile)) return 'Mobile number is mandatory and cannot be NA';
      if (!mobileRegex.test(mobile)) return 'Mobile number must be 10 digits';
    } else {
      if (!mobile) return 'Mobile number is required';
      if (!isNAValue(mobile) && !mobileRegex.test(mobile)) return 'Mobile number must be 10 digits or NA';
    }
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
      state: client.state || '',
      clientType: client.clientType || 'FARMER',
      mobile: client.contactInfo?.mobile || client.contactInfo?.phone || '',
      userId: null,
      userEmail: null,
      wspName: 'System'
    }));

    return JSON.parse(JSON.stringify(legacyClients));
  }

  const db = await getDb();
  const userIds = clients.map(client => client.userId).filter((id): id is any => !!id);
  const users = userIds.length > 0 ? await db.collection('users').find({ _id: { $in: userIds } }).project({ _id: 1, fullName: 1, email: 1, companyName: 1 }).toArray() : [];
  const userMap = new Map(users.map(u => [u._id.toString(), { fullName: u.fullName, email: u.email, companyName: u.companyName }]));

  return JSON.parse(JSON.stringify(clients.map(client => {
    const userId = client.userId?.toString();
    const userInfo = userId ? userMap.get(userId) : null;
    const wspName = userInfo?.companyName || userInfo?.fullName || userInfo?.email || (client.userId ? 'Unknown' : 'System');

    return {
      ...client.toObject?.() || client,
      wspName,
    };
  })));
}

export async function createClient(data: {
  name: string;
  address: string;
  clientType: 'FARMER' | 'FPO' | 'COMPANY' | 'PURCHASE';
  mobile: string;
  panNumber: string;
  aadharNumber: string;
  gstNumber: string;
  state?: string;
  commodityIds?: string[];
  email?: string;
}, isColdStorage: boolean = false) {
  await requireWspActionPermission('clientMaster');
  await connectToDatabase();
  try {
    if (!data.state || !data.state.trim()) {
      return { success: false, error: 'State is required' };
    }

    const validationError = validateClientData(data, isColdStorage);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const session = await requireSession();
    const nameValue = data.name.trim();
    const baseNameKey = nameValue.toUpperCase();
    const nameKey = isColdStorage ? `${baseNameKey}_${data.mobile.trim()}` : baseNameKey;

    const email = normalizeEmail(session.user.email);
    const ownerFilter: any = {
      $or: [
        { userId: session.user.id },
        ...(email
          ? [{
            $and: [
              { $or: [{ userId: { $exists: false } }, { userId: null }] },
              { userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }
            ]
          }]
          : [])
      ]
    };

    if (isColdStorage) {
      const existingClientByMobile = await Client.findOne({
        $and: [ownerFilter, { mobile: data.mobile.trim() }]
      });
      if (existingClientByMobile) {
        return { success: false, error: 'Mobile number already exists for another client' };
      }

      if (data.aadharNumber && !isNAValue(data.aadharNumber)) {
        const existingAadhar = await Client.findOne({ $and: [ownerFilter, { aadharNumber: data.aadharNumber.trim() }] });
        if (existingAadhar) return { success: false, error: 'Aadhaar No. already exists.' };
      }
      if (data.panNumber && !isNAValue(data.panNumber)) {
        const existingPan = await Client.findOne({ $and: [ownerFilter, { panNumber: data.panNumber.trim() }] });
        if (existingPan) return { success: false, error: 'PAN No. already exists.' };
      }
      if (data.gstNumber && !isNAValue(data.gstNumber)) {
        const existingGst = await Client.findOne({ $and: [ownerFilter, { gstNumber: data.gstNumber.trim() }] });
        if (existingGst) return { success: false, error: 'GSTIN already exists.' };
      }
    } else {
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
    }

    const client = await Client.create(appendOwnership({ ...data, name: nameValue, nameKey }, session));

    await logActivity({
      actionType: 'CREATE',
      module: 'Client Master',
      recordId: client._id.toString(),
      description: `Added new client: ${client.name}`,
      newValue: JSON.parse(JSON.stringify(client)),
      storageType: isColdStorage ? 'Cold Storage' : 'Dry Storage',
      sessionFallback: session
    });

    if (isColdStorage) {
      revalidatePath('/cold/clients');
    } else {
      revalidatePath('/dashboard/clients');
    }

    return {
      success: true,
      data: JSON.parse(JSON.stringify(client)),
    };
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
  state?: string;
  commodityIds?: string[];
}>, isColdStorage: boolean = false) {
  await requireWspActionPermission('clientMaster');
  await connectToDatabase();
  try {
    const validationError = validateClientData(data as any, isColdStorage);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const session = await requireSession();
    if (data.name) {
      const nameValue = data.name.trim();
      const baseNameKey = nameValue.toUpperCase();
      const nameKey = isColdStorage && data.mobile ? `${baseNameKey}_${data.mobile.trim()}` : baseNameKey;
      data.name = nameValue;
      data.nameKey = nameKey;

      const email = normalizeEmail(session.user.email);
      const ownerFilter: any = {
        $or: [
          { userId: session.user.id },
          ...(email
            ? [{
              $and: [
                { $or: [{ userId: { $exists: false } }, { userId: null }] },
                { userEmail: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`, 'i') } }
              ]
            }]
            : [])
        ]
      };
      if (isColdStorage) {
        if (data.mobile) {
          const existingClientByMobile = await Client.findOne({
            _id: { $ne: id },
            $and: [ownerFilter, { mobile: data.mobile.trim() }]
          });
          if (existingClientByMobile) {
            return { success: false, error: 'Mobile number already exists for another client' };
          }
        }

        if (data.aadharNumber && !isNAValue(data.aadharNumber)) {
          const existingAadhar = await Client.findOne({ _id: { $ne: id }, $and: [ownerFilter, { aadharNumber: data.aadharNumber.trim() }] });
          if (existingAadhar) return { success: false, error: 'Aadhaar No. already exists.' };
        }
        if (data.panNumber && !isNAValue(data.panNumber)) {
          const existingPan = await Client.findOne({ _id: { $ne: id }, $and: [ownerFilter, { panNumber: data.panNumber.trim() }] });
          if (existingPan) return { success: false, error: 'PAN No. already exists.' };
        }
        if (data.gstNumber && !isNAValue(data.gstNumber)) {
          const existingGst = await Client.findOne({ _id: { $ne: id }, $and: [ownerFilter, { gstNumber: data.gstNumber.trim() }] });
          if (existingGst) return { success: false, error: 'GSTIN already exists.' };
        }
      } else {
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
    }

    const oldClient = await Client.findOne({ _id: id, ...getTenantFilter(session) });
    const previousValue = oldClient ? JSON.parse(JSON.stringify(oldClient)) : null;

    const client = await Client.findOneAndUpdate(
      { _id: id, ...getTenantFilter(session) },
      data,
      { new: true }
    );

    if (client) {
      await logActivity({
        actionType: 'UPDATE',
        module: 'Client Master',
        recordId: client._id.toString(),
        description: `Updated client: ${client.name}`,
        previousValue,
        newValue: JSON.parse(JSON.stringify(client)),
        storageType: isColdStorage ? 'Cold Storage' : 'Dry Storage',
        sessionFallback: session
      });
    }

    if (client && !isColdStorage) {
      const userUpdate: any = { updatedAt: new Date() };
      if (data.name) {
        userUpdate.fullName = data.name;
        userUpdate.companyName = data.name;
      }
      if (data.clientType) {
        userUpdate.role = data.clientType;
      }
      if (data.mobile) {
        userUpdate.phoneNumber = data.mobile;
      }
      if (data.address) {
        userUpdate.warehouseLocation = data.address;
      }
      if (data.gstNumber) {
        userUpdate.gstNumber = data.gstNumber;
      }
      if ((data as any).email) {
        userUpdate.email = (data as any).email;
      }

      if (Object.keys(userUpdate).length > 1) {
        const db = await getDb();
        const userQuery: any = {};

        if (client.userId) {
          userQuery._id = client.userId;
        } else if (client.userEmail) {
          userQuery.email = client.userEmail;
        }

        if (Object.keys(userQuery).length > 0) {
          await db.collection('users').updateOne({ ...userQuery }, { $set: userUpdate });
        }
      }
    }

    revalidatePath('/dashboard/clients');
    return { success: true, data: JSON.parse(JSON.stringify(client)) };
  } catch (error: unknown) {
    const message = error instanceof Error && /duplicate key/i.test(error.message)
      ? 'Client name already exists for your account'
      : error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function deleteClient(id: string, isColdStorage: boolean = false) {
  await requireWspActionPermission('clientMaster');
  await connectToDatabase();
  try {
    const session = await requireSession();

    // Calculate the client's current stock balance using all inward and outward transactions
    const inwardAgg = await Inward.aggregate([
      { $match: { clientId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$quantityMT' } } }
    ]);
    const outwardAgg = await Outward.aggregate([
      { $match: { clientId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$quantityMT' } } }
    ]);

    const totalInward = inwardAgg[0]?.total || 0;
    const totalOutward = outwardAgg[0]?.total || 0;
    const remainingStock = Math.round((totalInward - totalOutward) * 10000) / 10000;

    if (remainingStock > 0) {
      return {
        success: false,
        error: 'Client cannot be deleted because stock is still available under this client. Please clear all remaining stock before deleting the client.'
      };
    }

    const clientToDelete = await Client.findOne({ _id: id, ...getTenantFilter(session) });
    if (!clientToDelete) throw new Error('Client not found');
    const previousValue = JSON.parse(JSON.stringify(clientToDelete));

    await Client.findOneAndDelete({ _id: id, ...getTenantFilter(session) });

    await logActivity({
      actionType: 'DELETE',
      module: 'Client Master',
      recordId: id,
      description: `Deleted client: ${clientToDelete.name}`,
      previousValue,
      storageType: isColdStorage ? 'Cold Storage' : 'Dry Storage',
      sessionFallback: session
    });

    revalidatePath('/dashboard/clients');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
