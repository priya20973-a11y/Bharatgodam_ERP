import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { requireSession } from '@/lib/ownership';
import { ObjectId } from 'mongodb';

export async function GET() {
  try {
    const session = await requireSession();
    if (session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const db = await getDb();
    const signupRequestsCollection = db.collection('signup_requests');

    const requests = await signupRequestsCollection
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Get signup requests error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    if (session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { action, requestId } = body;

    if (!action || !requestId) {
      return NextResponse.json(
        { message: 'Action and requestId are required' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const signupRequestsCollection = db.collection('signup_requests');
    const usersCollection = db.collection('users');

    const request = await signupRequestsCollection.findOne({ _id: new ObjectId(requestId) });
    if (!request) {
      return NextResponse.json(
        { message: 'Signup request not found' },
        { status: 404 }
      );
    }

    if (action === 'approve') {
      // Check if user already exists
      const existingUser = await usersCollection.findOne({ email: request.email });
      if (existingUser) {
        return NextResponse.json(
          { message: 'User with this email already exists' },
          { status: 400 }
        );
      }

      // Create the user
      const userData = {
        fullName: request.fullName,
        email: request.email,
        password: request.password, // Already hashed
        companyName: request.companyName,
        phoneNumber: request.phoneNumber,
        warehouseLocation: request.warehouseLocation,
        gstNumber: request.gstNumber,
        role: request.role,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await usersCollection.insertOne(userData);

      // Update request status
      await signupRequestsCollection.updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { status: 'approved', updatedAt: new Date() } }
      );

      return NextResponse.json({ message: 'Request approved and user created' });
    } else if (action === 'reject') {
      await signupRequestsCollection.updateOne(
        { _id: new ObjectId(requestId) },
        { $set: { status: 'rejected', updatedAt: new Date() } }
      );

      return NextResponse.json({ message: 'Request rejected' });
    } else {
      return NextResponse.json(
        { message: 'Invalid action' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Process signup request error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}