import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/mongodb';

function generateTemporaryPassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const all = uppercase + lowercase + numbers;

  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];

  for (let i = 0; i < 6; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password.split('').sort(() => Math.random() - 0.5).join('');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body.email || '').toString().trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ success: false, message: 'Please provide a valid email' }, { status: 400 });
    }

    const db = await getDb();
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      // Do not reveal whether email exists; respond with generic message
      return NextResponse.json({ success: true, message: 'If an account exists for this email, a temporary password has been generated.' });
    }

    // Generate temporary password and set it
    const tempPassword = generateTemporaryPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);
    await db.collection('users').updateOne({ _id: user._id }, { $set: { password: hashed, updatedAt: new Date() } });

    // NOTE: Ideally send email with temp password. For now return temp in response so UI can display instructions.
    return NextResponse.json({ success: true, message: 'Temporary password generated. Use it to sign in and change your password.', tempPassword });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
