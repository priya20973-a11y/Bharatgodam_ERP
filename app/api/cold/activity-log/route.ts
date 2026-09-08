import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import ColdActivityLog from '@/lib/models/ColdActivityLog';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user || (session.user.role !== 'SUPERADMIN' && session.user.role !== 'WSP_ADMIN' && session.user.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized. Admin access required.' }, { status: 403 });
    }

    await connectToDatabase();
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const moduleFilter = searchParams.get('module');
    const actionFilter = searchParams.get('action');
    const userFilter = searchParams.get('user');
    const searchFilter = searchParams.get('search');
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    const storageTypeFilter = searchParams.get('storageType');
    
    const query: any = {};

    if (moduleFilter) query.module = moduleFilter;
    if (actionFilter) query.actionType = actionFilter;
    if (userFilter) query.userId = userFilter; // Assuming userFilter is userId, or we can search by userName
    if (storageTypeFilter && storageTypeFilter !== 'All') query.storageType = storageTypeFilter;
    
    if (searchFilter) {
      query.$or = [
        { userName: { $regex: searchFilter, $options: 'i' } },
        { module: { $regex: searchFilter, $options: 'i' } },
        { description: { $regex: searchFilter, $options: 'i' } },
        { recordId: { $regex: searchFilter, $options: 'i' } }
      ];
    }
    
    if (dateStart || dateEnd) {
      query.createdAt = {};
      if (dateStart) query.createdAt.$gte = new Date(dateStart);
      if (dateEnd) {
        const endDate = new Date(dateEnd);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    const sortOrder = searchParams.get('sort') === 'oldest' ? 1 : -1;

    const logs = await ColdActivityLog.find(query)
      .sort({ createdAt: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await ColdActivityLog.countDocuments(query);

    return NextResponse.json({
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching activity logs:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch logs' }, { status: 500 });
  }
}
