import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    console.log('User management API called');
    const session = await requireSession();
    console.log('Session:', { user: session.user.email, role: session.user.role });

    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { action, userId } = body;
    console.log('Request body:', { action, userId });

    if (!action || !userId) {
      return NextResponse.json(
        { message: 'Action and userId are required' },
        { status: 400 }
      );
    }

    // Validate userId format
    let objectId;
    try {
      objectId = new ObjectId(userId);
    } catch (error) {
      return NextResponse.json(
        { message: 'Invalid userId format' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ _id: objectId });
    if (!user) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent actions on admin users (except the current admin)
    if (user.role === 'ADMIN' && user.email !== session.user.email) {
      return NextResponse.json(
        { message: 'Cannot perform actions on other admin users' },
        { status: 403 }
      );
    }

    if (action === 'activate') {
      await usersCollection.updateOne(
        { _id: objectId },
        {
          $set: {
            status: 'ACTIVE',
            updatedAt: new Date()
          }
        }
      );
      return NextResponse.json({ message: 'User activated successfully' });
    } else if (action === 'deactivate') {
      await usersCollection.updateOne(
        { _id: objectId },
        {
          $set: {
            status: 'INACTIVE',
            updatedAt: new Date()
          }
        }
      );
      return NextResponse.json({ message: 'User deactivated successfully' });
    } else if (action === 'delete') {
      // Double check - don't allow deletion of admin users
      if (user.role === 'ADMIN') {
        return NextResponse.json(
          { message: 'Cannot delete admin users' },
          { status: 403 }
        );
      }

      await usersCollection.deleteOne({ _id: objectId });
      return NextResponse.json({ message: 'User deleted successfully' });
    } else {
      return NextResponse.json(
        { message: 'Invalid action' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('User management error:', error);
    return NextResponse.json(
      { 
        message: 'Internal Server Error', 
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}