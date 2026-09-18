import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Routes that stay reachable without a session. The legal pages are listed
 * deliberately: policies must be readable by signed-out visitors and signed-in
 * users alike, so they can never sit behind the login wall.
 */
const PUBLIC_PREFIXES = [
  '/legal',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/support',
  '/help',
  '/maintenance',
  '/offline',
  '/session-expired',
  // NextAuth's own endpoints plus registration, password reset and email
  // verification must remain reachable to signed-out users.
  '/api/auth',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Maintenance mode short-circuits the whole app. Checked before anything
  // else so it applies to signed-in users and API clients as well.
  if (process.env.MAINTENANCE_MODE === 'true' && pathname !== '/maintenance') {
    if (pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'IgniteAI Studio is under maintenance. Please try again shortly.' },
        { status: 503 }
      );
    }
    return NextResponse.rewrite(new URL('/maintenance', req.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except Next's build output and static assets, so maintenance
  // mode and the public-route list are enforced app-wide rather than only on a
  // hand-maintained list of app routes.
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$).*)',
  ],
};
