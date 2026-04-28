import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/mongodb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      fullName,
      email,
      password,
      confirmPassword,
      companyName,
      phoneNumber,
      warehouseLocation,
      gstNumber,
      role
    } = body;

    // Validation
    if (!fullName || !email || !password || !confirmPassword || !companyName || !phoneNumber || !warehouseLocation) {
      return NextResponse.json(
        { message: 'All required fields must be filled.' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { message: 'Passwords do not match.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: 'Password must be at least 6 characters.' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const usersCollection = db.collection('users');
    const signupRequestsCollection = db.collection('signup_requests');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { message: 'A user with this email already exists.' },
        { status: 400 }
      );
    }

    // Check if signup request already exists
    const existingRequest = await signupRequestsCollection.findOne({ email });
    if (existingRequest) {
      return NextResponse.json(
        { message: 'A signup request with this email is already pending approval.' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create signup request
    const signupRequest = {
      fullName,
      email,
      password: hashedPassword,
      companyName,
      phoneNumber,
      warehouseLocation,
      gstNumber: gstNumber || null,
      role: role || 'wsp',
      status: 'pending', // pending, approved, rejected
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await signupRequestsCollection.insertOne(signupRequest);

    // TODO: Send notification to admin (email or in-app notification)

    return NextResponse.json(
      { message: 'Signup request submitted successfully. Please wait for admin approval.', requestId: result.insertedId },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
