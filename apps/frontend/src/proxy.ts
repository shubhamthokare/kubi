import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_FILE = /\.(.*)$/;
const exactRoutes = new Set([
  '/',
  '/analyzer',
  '/auth/callback',
  '/dashboard',
  '/dashboard/configure',
  '/forgot-password',
  '/incidents',
  '/incidents/ingest',
  '/login',
  '/logs',
  '/playbooks',
  '/register',
  '/remediation',
  '/reports',
  '/settings',
  '/verify-email',
]);

function isKnownRoute(pathname: string) {
  if (exactRoutes.has(pathname)) return true;
  return /^\/dashboard\/incidents\/[^/]+\/report$/.test(pathname);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    PUBLIC_FILE.test(pathname) ||
    isKnownRoute(pathname)
  ) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/', request.url));
}

export const config = {
  matcher: '/:path*',
};
