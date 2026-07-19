import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith('/api');

  if (isApiRoute) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/chat/:path*',
    '/documents/:path*',
    '/content-generator/:path*',
    '/settings/:path*',
    // All /api/* routes except /api/auth/* (NextAuth's own endpoints, and our
    // registration endpoint, must remain publicly reachable).
    '/api/((?!auth/).*)',
  ],
};
