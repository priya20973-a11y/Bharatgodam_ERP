'use server';

import { getDb } from '@/lib/mongodb';
import { requireSession } from '@/lib/ownership';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { hasPermission } from '@/lib/permissions';

export async function getStaffList() {
  const session = await requireSession();
  
  if (!hasPermission(session, 'staff', 'view')) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  // Fetch users with role STAFF and wspId matching the current WSP's id
  const staffMembers = await db.collection('users').find({
    role: 'STAFF',
    wspId: session.user.id
  }).toArray();

  return staffMembers.map(staff => ({
    _id: staff._id.toString(),
    fullName: staff.fullName || '',
    email: staff.email,
    phoneNumber: staff.phoneNumber || '',
    status: staff.status || 'ACTIVE',
    permissions: staff.permissions || {},
    assignedWarehouseIds: staff.assignedWarehouseIds || [],
  }));
}

export async function createStaff(data: any) {
  const session = await requireSession();

  if (!hasPermission(session, 'staff', 'create')) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  
  // Check if email already exists
  const existingUser = await db.collection('users').findOne({ email: data.email });
  if (existingUser) {
    throw new Error('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  const result = await db.collection('users').insertOne({
    role: 'STAFF',
    storagePlan: 'COLD',
    wspId: session.user.id,
    fullName: data.fullName,
    email: data.email,
    password: hashedPassword,
    phoneNumber: data.phoneNumber,
    status: 'ACTIVE',
    permissions: data.permissions || {},
    assignedWarehouseIds: data.assignedWarehouseIds || [],
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return { success: true, id: result.insertedId.toString() };
}

export async function updateStaff(id: string, data: any) {
  const session = await requireSession();

  if (!hasPermission(session, 'staff', 'edit')) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  
  // Ensure the staff belongs to this WSP
  const staff = await db.collection('users').findOne({ _id: new ObjectId(id), wspId: session.user.id });
  if (!staff) {
    throw new Error('Staff not found');
  }

  const updateData: any = {
    fullName: data.fullName,
    phoneNumber: data.phoneNumber,
    permissions: data.permissions || {},
    assignedWarehouseIds: data.assignedWarehouseIds || [],
    updatedAt: new Date()
  };

  if (data.email && data.email !== staff.email) {
     const existingUser = await db.collection('users').findOne({ email: data.email });
     if (existingUser) {
       throw new Error('Email already registered');
     }
     updateData.email = data.email;
  }

  await db.collection('users').updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  return { success: true };
}

export async function toggleStaffStatus(id: string, status: string) {
  const session = await requireSession();

  if (!hasPermission(session, 'staff', 'edit')) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  await db.collection('users').updateOne(
    { _id: new ObjectId(id), wspId: session.user.id },
    { $set: { status, updatedAt: new Date() } }
  );
  return { success: true };
}

export async function deleteStaff(id: string) {
  const session = await requireSession();

  if (!hasPermission(session, 'staff', 'delete')) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  await db.collection('users').deleteOne({ _id: new ObjectId(id), wspId: session.user.id });
  return { success: true };
}

export async function resetStaffPassword(id: string, newPassword: string) {
  const session = await requireSession();

  if (!hasPermission(session, 'staff', 'edit')) {
    throw new Error('Unauthorized');
  }

  const db = await getDb();
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await db.collection('users').updateOne(
    { _id: new ObjectId(id), wspId: session.user.id },
    { $set: { password: hashedPassword, updatedAt: new Date() } }
  );
  return { success: true };
}
