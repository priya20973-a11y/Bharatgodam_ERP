import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ ok: false, message: 'email and password required' }, { status: 400 });

    await connectToDatabase();
    const { getDb } = await import('@/lib/mongodb');
    const db = await getDb();

    const user = await db.collection('users').findOne({ email: email.toString().trim().toLowerCase() });
    if (!user) return NextResponse.json({ ok: false, message: 'user not found' }, { status: 404 });

    const isValid = await bcrypt.compare(password, user.password);
    return NextResponse.json({ ok: isValid, user: { email: user.email, role: user.role } });
  } catch (error) {
    console.error('Auth-check error', error);
    return NextResponse.json({ ok: false, message: 'internal error' }, { status: 500 });
  }
}
