import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function proxy(request) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protected routes for player
  const playerRoutes = ['/home', '/jugar', '/ranking', '/billetera']
  const isPlayerRoute = playerRoutes.some(route => pathname.startsWith(route))

  // Admin routes
  const isAdminRoute = pathname.startsWith('/admin')

  // Auth routes
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/registro')

  if (!user && (isPlayerRoute || isAdminRoute)) {
    // Redirect unauthenticated users to login
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user) {
    let role = null
    if (isAuthRoute || isAdminRoute) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      role = profile?.role ?? 'player'
    }

    if (isAuthRoute) {
      // Redirect authenticated users away from login/register based on role
      const url = request.nextUrl.clone()
      url.pathname = role === 'admin' ? '/admin' : '/home'
      return NextResponse.redirect(url)
    }

    if (isAdminRoute && role !== 'admin') {
      // Non-admins can't access /admin routes even if authenticated
      const url = request.nextUrl.clone()
      url.pathname = '/home'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
