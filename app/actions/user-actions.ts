'use server';

import { getDb } from '@/lib/mongodb';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';
import { requireSession } from '@/lib/ownership';
import bcrypt from 'bcryptjs';

export interface User {
  _id: string;
  email: string;
  role: string;
  fullName?: string;
  companyName?: string;
  phoneNumber?: string;
  warehouseLocation?: string;
  gstNumber?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  updatedAt?: string;
  password?: string;
  clientAssociations?: string[];
  commodityAssociations?: string[];
  warehouseAssociations?: string[];
}

export async function getAllUsers(): Promise<User[]> {
  const db = await getDb();
  const users = await db.collection('users').find({}).sort({ createdAt: -1 }).toArray();

  const userIds = users.map(user => user._id);
  const userEmails = users.map(user => user.email);

  const [clients, commodities, warehouses] = await Promise.all([
    db.collection('clients')
      .find({
        $or: [
          { userId: { $in: userIds } },
          { userEmail: { $in: userEmails } },
        ],
      })
      .project({ name: 1, userId: 1, userEmail: 1 })
      .toArray(),
    db.collection('commodities')
      .find({
        $or: [
          { userId: { $in: userIds } },
          { userEmail: { $in: userEmails } },
        ],
      })
      .project({ name: 1, userId: 1, userEmail: 1 })
      .toArray(),
    db.collection('warehouses')
      .find({
        $or: [
          { userId: { $in: userIds } },
          { userEmail: { $in: userEmails } },
        ],
      })
      .project({ name: 1, userId: 1, userEmail: 1 })
      .toArray(),
  ]);

  const associationMap = new Map<string, {
    clientAssociations: Set<string>;
    commodityAssociations: Set<string>;
    warehouseAssociations: Set<string>;
  }>();

  users.forEach(user => {
    associationMap.set(user._id.toString(), {
      clientAssociations: new Set(),
      commodityAssociations: new Set(),
      warehouseAssociations: new Set(),
    });
  });

  const addAssociation = (
    collectionUserId: any,
    collectionUserEmail: string | undefined,
    name: string,
    targetSet: 'clientAssociations' | 'commodityAssociations' | 'warehouseAssociations'
  ) => {
    if (!name) return;
    const userIdKey = collectionUserId?.toString();
    if (userIdKey && associationMap.has(userIdKey)) {
      associationMap.get(userIdKey)?.[targetSet].add(name);
      return;
    }

    if (collectionUserEmail) {
      const user = users.find(user => user.email === collectionUserEmail);
      if (user) {
        associationMap.get(user._id.toString())?.[targetSet].add(name);
      }
    }
  };

  clients.forEach(client => {
    addAssociation(client.userId, client.userEmail, client.name, 'clientAssociations');
  });

  commodities.forEach(commodity => {
    addAssociation(commodity.userId, commodity.userEmail, commodity.name, 'commodityAssociations');
  });

  warehouses.forEach(warehouse => {
    addAssociation(warehouse.userId, warehouse.userEmail, warehouse.name, 'warehouseAssociations');
  });

  return users.map(user => {
    const associations = associationMap.get(user._id.toString());
    return {
      _id: user._id.toString(),
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      companyName: user.companyName,
      phoneNumber: user.phoneNumber,
      warehouseLocation: user.warehouseLocation,
      gstNumber: user.gstNumber,
      status: user.status,
      password: user.password,
      createdAt: user.createdAt ? user.createdAt.toISOString() : undefined,
      updatedAt: user.updatedAt ? user.updatedAt.toISOString() : undefined,
      clientAssociations: associations ? Array.from(associations.clientAssociations).slice(0, 10) : [],
      commodityAssociations: associations ? Array.from(associations.commodityAssociations).slice(0, 10) : [],
      warehouseAssociations: associations ? Array.from(associations.warehouseAssociations).slice(0, 10) : [],
    };
  }) as User[];
}

export async function activateUser(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized' };
    }

    // Validate userId format
    let objectId;
    try {
      objectId = new ObjectId(userId);
    } catch (error) {
      return { success: false, message: 'Invalid userId format' };
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    await usersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          status: 'ACTIVE',
          updatedAt: new Date()
        }
      }
    );

    revalidatePath('/dashboard/settings/users');
    return { success: true, message: 'User activated successfully' };
  } catch (error) {
    console.error('Error activating user:', error);
    return { success: false, message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function deactivateUser(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized' };
    }

    // Validate userId format
    let objectId;
    try {
      objectId = new ObjectId(userId);
    } catch (error) {
      return { success: false, message: 'Invalid userId format' };
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Prevent actions on admin users (except the current admin)
    if (user.role === 'ADMIN' && user.email !== session.user.email) {
      return { success: false, message: 'Cannot perform actions on other admin users' };
    }

    await usersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          status: 'INACTIVE',
          updatedAt: new Date()
        }
      }
    );

    revalidatePath('/dashboard/settings/users');
    return { success: true, message: 'User deactivated successfully' };
  } catch (error) {
    console.error('Error deactivating user:', error);
    return { success: false, message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function deleteUser(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized' };
    }

    // Validate userId format
    let objectId;
    try {
      objectId = new ObjectId(userId);
    } catch (error) {
      return { success: false, message: 'Invalid userId format' };
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Prevent deleting the last admin user
    if (user.role === 'ADMIN') {
      const adminCount = await usersCollection.countDocuments({ role: 'ADMIN', status: 'ACTIVE' });
      if (adminCount <= 1) {
        return { success: false, message: 'Cannot delete the last active admin user' };
      }
    }

    await usersCollection.deleteOne({ _id: objectId });

    revalidatePath('/dashboard/settings/users');
    return { success: true, message: 'User deleted successfully' };
  } catch (error) {
    console.error('Error deleting user:', error);
    return { success: false, message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await requireSession();
    if (session.user.role !== 'ADMIN') {
      return { success: false, message: 'Unauthorized' };
    }

    // Validate userId format
    let objectId;
    try {
      objectId = new ObjectId(userId);
    } catch (error) {
      return { success: false, message: 'Invalid userId format' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters' };
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await usersCollection.updateOne(
      { _id: objectId },
      {
        $set: {
          password: hashedPassword,
          updatedAt: new Date()
        }
      }
    );

    revalidatePath('/dashboard/settings/users');
    return { success: true, message: 'Password reset successfully' };
  } catch (error) {
    console.error('Error resetting user password:', error);
    return { success: false, message: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const db = await getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    return user as User | null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

// Server Actions for forms
export async function activateUserAction(formData: FormData) {
  const userId = formData.get('userId') as string;
  const email = formData.get('email') as string;

  const result = await activateUser(userId);
  if (!result.success) {
    throw new Error(result.message);
  }
}

export async function deactivateUserAction(formData: FormData) {
  const userId = formData.get('userId') as string;
  const email = formData.get('email') as string;

  try {
    const result = await deactivateUser(userId);
    if (!result.success) {
      console.error('Deactivate user failed:', result.message);
      throw new Error(`Failed to deactivate user: ${result.message}`);
    }
    // Server actions should not return values
  } catch (error) {
    console.error('Error in deactivateUserAction:', error);
    throw error;
  }
}

export async function resetUserPasswordAction(formData: FormData) {
  const userId = formData.get('userId') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!newPassword || !confirmPassword) {
    throw new Error('All password fields are required');
  }

  if (newPassword !== confirmPassword) {
    throw new Error('Passwords do not match');
  }

  const result = await resetUserPassword(userId, newPassword);
  if (!result.success) {
    throw new Error(result.message);
  }
}

export async function deleteUserAction(formData: FormData) {
  const userId = formData.get('userId') as string;
  const email = formData.get('email') as string;

  try {
    const result = await deleteUser(userId);
    if (!result.success) {
      console.error('Delete user failed:', result.message);
      throw new Error(`Failed to delete user: ${result.message}`);
    }
    // Server actions should not return values
  } catch (error) {
    console.error('Error in deleteUserAction:', error);
    throw error;
  }
}