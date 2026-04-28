import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Example: Redirect non-admins away from an admin panel
    if (
      req.nextUrl.pathname.startsWith('/admin') &&
      req.nextauth.token?.role !== 'admin'
    ) {
      return NextResponse.rewrite(new URL('/unauthorized', req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token, // Return true if valid token exists
    },
    pages: {
      signIn: '/', // Redirect to our custom login page
    },
  }
);

export const config = {
  // Add all routes that MUST be protected
  matcher: ['/dashboard/:path*', '/inventory/:path*', '/admin/:path*'],
};
