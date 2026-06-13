import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getDb } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';

const nextAuthUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? getNextAuthUrlFromVercel() : undefined);
const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!process.env.NEXTAUTH_URL && nextAuthUrl) {
  process.env.NEXTAUTH_URL = nextAuthUrl;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'email@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        const db = await getDb();
        const user = await db.collection('users').findOne({ email: credentials.email });

        if (!user) {
          throw new Error('No user found with this email');
        }

        // Check if user is active
        if (user.status === 'INACTIVE') {
          throw new Error('Your account has been deactivated. Please contact administrator.');
        }

        const isValid = await bcrypt.compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error('Invalid password');
        }

        return {
          id: user._id.toString(),
          email: user.email,
          role: user.role?.toString().toUpperCase(),
          fullName: user.fullName || '',
          companyName: user.companyName || '',
          phoneNumber: user.phoneNumber || '',
          warehouseLocation: user.warehouseLocation || '',
          gstNumber: user.gstNumber || null,
          bankName: user.bankName || null,
          bankAccountNumber: user.bankAccountNumber || null,
          ifscCode: user.ifscCode || null,
          bankBranch: user.bankBranch || null,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    // Append user details to the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role?.toString().toUpperCase();
        token.fullName = (user as any).fullName || '';
        token.companyName = (user as any).companyName || '';
        token.phoneNumber = (user as any).phoneNumber || '';
        token.warehouseLocation = (user as any).warehouseLocation || '';
        token.gstNumber = (user as any).gstNumber || null;
        token.bankName = (user as any).bankName || null;
        token.bankAccountNumber = (user as any).bankAccountNumber || null;
        token.ifscCode = (user as any).ifscCode || null;
        token.bankBranch = (user as any).bankBranch || null;
        token.companyLogo = (user as any).companyLogo || null;
      }
      return token;
    },
    // Pass the token details to the Client Session object
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).fullName = token.fullName;
        (session.user as any).companyName = token.companyName;
        (session.user as any).phoneNumber = token.phoneNumber;
        (session.user as any).warehouseLocation = token.warehouseLocation;
        (session.user as any).gstNumber = token.gstNumber;
        (session.user as any).bankName = token.bankName || null;
        (session.user as any).bankAccountNumber = token.bankAccountNumber || null;
        (session.user as any).ifscCode = token.ifscCode || null;
        (session.user as any).bankBranch = token.bankBranch || null;
        (session.user as any).companyLogo = token.companyLogo || null;
      }
      return session;
    },
  },
  pages: {
    signIn: '/', // Specify your custom login page route
  },
  secret: nextAuthSecret,
};

if (process.env.NODE_ENV === 'production' && !nextAuthUrl) {
  throw new Error('Invalid/Missing environment variable: "NEXTAUTH_URL" in production');
}

if (!nextAuthSecret) {
  throw new Error('Invalid/Missing environment variable: "NEXTAUTH_SECRET"');
}

function getNextAuthUrlFromVercel() {
  const vercelUrl = process.env.VERCEL_URL;
  if (!vercelUrl) return undefined;
  return vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
}
