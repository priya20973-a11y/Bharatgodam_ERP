import NextAuth from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { NextRequest } from 'next/server';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };