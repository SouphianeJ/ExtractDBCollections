import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE_NAME, isValidAdminSessionToken } from './src/lib/auth/session';

function isStaticAsset(pathname: string): boolean {
  return pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/assets');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const hasSession = await isValidAdminSessionToken(sessionToken);

  if (pathname.startsWith('/login')) {
    if (hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      url.search = '';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  if (pathname.startsWith('/admin')) {
    if (!hasSession) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      if (pathname !== '/admin') {
        url.searchParams.set('from', pathname);
      }
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login']
};
