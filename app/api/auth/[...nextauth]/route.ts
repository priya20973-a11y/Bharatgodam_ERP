import NextAuth from "next-auth";
import { authOptions } from '@/lib/auth';

const nextAuthHandler = NextAuth(authOptions);

export async function GET(req: any, context: any) {
  const params = await context.params;
  return nextAuthHandler(req, { params });
}

export async function POST(req: any, context: any) {
  const params = await context.params;
  return nextAuthHandler(req, { params });
}