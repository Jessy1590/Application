import { type NextRequest, NextResponse } from 'next/server';
import { siteByPathPrefix } from '@/config/sites';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

const PUBLIC_EXACT = new Set([
  '/auth/callback',
  '/auth/callback/',
  '/manifest.webmanifest',
  '/hub-icon.svg',
  '/protect.js',
]);

function isLoginPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/login/';
}

function isPublicAsset(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith('/shared/')) return true;
  if (pathname.endsWith('.webmanifest')) return true;
  if (pathname.endsWith('/icon.svg') || pathname.includes('/icons/')) return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|map)$/i.test(pathname)) return true;
  return false;
}

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    isPublicAsset(pathname)
  ) {
    return NextResponse.next();
  }

  const { supabase, supabaseResponse } = await createMiddlewareClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Login : accessible sans session ; si déjà connecté → hub
  if (isLoginPath(pathname)) {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (!user) {
    return loginRedirect(request);
  }

  const site = siteByPathPrefix(pathname);
  if (site) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role === 'admin') {
      return supabaseResponse;
    }

    const { data: access } = await supabase
      .from('site_access')
      .select('site_id')
      .eq('user_id', user.id)
      .eq('site_id', site.siteId)
      .maybeSingle();

    if (!access) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Hub et autres routes Next : session suffisante
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Tout sauf assets Next internes.
     * Inclut /Banque/, /Vaccin/, etc. (fichiers public/).
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
