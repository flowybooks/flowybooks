// This proxy protects app routes behind org-aware authentication.
// It validates the current session while keeping local bookkeeping routes available.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedRoutePrefixes = [
  '/dashboard',
];

function matchesRouteSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedAppPath(pathname: string) {
  const normalizedPathname = pathname.toLowerCase();
  return protectedRoutePrefixes.some((prefix) =>
    matchesRouteSegment(normalizedPathname, prefix),
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.toLowerCase();

  if (isProtectedAppPath(pathname)) {
    try {
      const validateResp = await fetch(new URL('/api/auth/validate', request.url), {
        headers: {
          cookie: request.headers.get('cookie') ?? '',
        },
        cache: 'no-store',
      });

      const validateJson = await validateResp.json().catch(() => null);

      if (validateResp.status === 401 || !validateJson?.authenticated) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }

      if (!validateResp.ok || validateJson.allowed === false) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
    } catch (error) {
      console.error('Session validation failed in local proxy:', error);
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|.*\\..*).*)'],
};
