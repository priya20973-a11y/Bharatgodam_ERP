import NextAuth from "next-auth/next";
import { authOptions } from '@/lib/auth';
import { NextRequest } from 'next/server';

const nextAuthHandler = NextAuth(authOptions);

export async function GET(req: NextRequest, context: { params: any }) {
  const params = await context.params;
  return nextAuthHandler(req, { params } as any);
}

export async function POST(req: NextRequest, context: { params: any }) {
  const params = await context.params;
  return nextAuthHandler(req, { params } as any);
}