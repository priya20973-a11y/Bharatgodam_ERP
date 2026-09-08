import connectToDatabase from '@/lib/mongoose';
import ColdActivityLog from '@/lib/models/ColdActivityLog';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function logColdActivity({
  actionType,
  module,
  recordId,
  description,
  previousValue,
  newValue,
  storageType,
  sessionFallback,
}: {
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'OTHER';
  module: string;
  recordId?: string;
  description: string;
  previousValue?: any;
  newValue?: any;
  storageType?: 'Cold Storage' | 'Dry Storage';
  sessionFallback?: any;
}) {
  try {
    await connectToDatabase();
    
    let session = sessionFallback;
    if (!session) {
      try {
        session = await getServerSession(authOptions);
      } catch (e) {
        console.warn('Could not get session automatically for logging');
      }
    }

    if (!session || !session.user) {
      console.warn('No user session found for ColdActivityLog, skipping log creation.');
      return;
    }

    const userId = session.user.id || session.user._id || 'UNKNOWN';
    const userName = session.user.name || session.user.email || 'UNKNOWN';
    const userRole = session.user.role || 'USER';

    await ColdActivityLog.create({
      userId,
      userName,
      userRole,
      actionType,
      module,
      recordId,
      description,
      previousValue,
      newValue,
      storageType: storageType || 'Cold Storage',
    });
  } catch (error) {
    console.error('Error creating ColdActivityLog:', error);
    // Don't throw, we don't want to fail the main transaction just because logging failed.
  }
}

export { logColdActivity as logActivity };
