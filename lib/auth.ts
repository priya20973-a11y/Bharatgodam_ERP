import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getDb } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';

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

        let userForSession = user;
        
        if (user.role === 'STAFF') {
          // If the user is STAFF, we authenticate them, but load the parent WSP for session data isolation
          const parentWsp = await db.collection('users').findOne({ _id: new ObjectId(user.wspId) });
          if (!parentWsp) {
            throw new Error('Parent WSP account not found. Please contact administrator.');
          }
          userForSession = parentWsp;
        }

        return {
          id: userForSession._id.toString(),
          email: userForSession.email,
          role: userForSession.role?.toString().toUpperCase(),
          fullName: userForSession.fullName || '',
          companyName: userForSession.companyName || '',
          phoneNumber: userForSession.phoneNumber || '',
          address: userForSession.address || null,
          warehouseLocation: userForSession.warehouseLocation || '',
          gstNumber: userForSession.gstNumber || null,
          bankName: userForSession.bankName || null,
          bankAccountNumber: userForSession.bankAccountNumber || null,
          ifscCode: userForSession.ifscCode || null,
          bankBranch: userForSession.bankBranch || null,
          state: userForSession.state || '',
          isNewRegistration: !!userForSession.isNewRegistration,
          storagePlan: userForSession.storagePlan || 'DRY',
          coldLanguage: userForSession.coldLanguage || 'en',
          
          // Staff properties
          ...(user.role === 'STAFF' ? {
            staffId: user._id.toString(),
            isStaff: true,
            permissions: user.permissions || {},
          } : {})
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
    async jwt({ token, user, trigger, session }) {
      if (trigger === 'update' && session?.coldLanguage) {
        token.coldLanguage = session.coldLanguage;
      }
      
      if (user) {
        token.id = user.id;
        token.role = (user as any).role?.toString().toUpperCase();
        token.fullName = (user as any).fullName || '';
        token.companyName = (user as any).companyName || '';
        token.phoneNumber = (user as any).phoneNumber || '';
        token.address = (user as any).address || null;
        token.warehouseLocation = (user as any).warehouseLocation || '';
        token.gstNumber = (user as any).gstNumber || null;
        token.bankName = (user as any).bankName || null;
        token.bankAccountNumber = (user as any).bankAccountNumber || null;
        token.ifscCode = (user as any).ifscCode || null;
        token.bankBranch = (user as any).bankBranch || null;
        token.state = (user as any).state || '';
        token.isNewRegistration = (user as any).isNewRegistration || false;
        token.storagePlan = (user as any).storagePlan || 'DRY';
        token.coldLanguage = (user as any).coldLanguage || 'en';
        
        if ((user as any).isStaff) {
          token.staffId = (user as any).staffId;
          token.isStaff = true;
          token.permissions = (user as any).permissions;
        }
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
        (session.user as any).address = token.address || null;
        (session.user as any).warehouseLocation = token.warehouseLocation;
        (session.user as any).gstNumber = token.gstNumber;
        (session.user as any).bankName = token.bankName || null;
        (session.user as any).bankAccountNumber = token.bankAccountNumber || null;
        (session.user as any).ifscCode = token.ifscCode || null;
        (session.user as any).bankBranch = token.bankBranch || null;
        (session.user as any).state = token.state || '';
        (session.user as any).isNewRegistration = token.isNewRegistration || false;
        (session.user as any).storagePlan = token.storagePlan || 'DRY';
        (session.user as any).coldLanguage = token.coldLanguage || 'en';
        
        if (token.isStaff) {
          (session.user as any).staffId = token.staffId;
          (session.user as any).isStaff = true;
          (session.user as any).permissions = token.permissions;
        }
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
