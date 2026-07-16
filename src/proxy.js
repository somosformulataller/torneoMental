import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Si Supabase Auth tarda o falla en responder, no queremos que TODA la
// navegación se caiga (eso es lo que el navegador muestra como "This page
// couldn't load") — mejor dejamos pasar la request sin verificar sesión acá;
// cada página igual revisa su propia sesión del lado del cliente y redirige
// a /login si hace falta.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export async function proxy(request) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const { pathname } = request.nextUrl

  const playerRoutes = ['/home', '/jugar', '/ranking', '/billetera']
  const isPlayerRoute = playerRoutes.some(route => pathname.startsWith(route))
  const isAdminRoute = pathname.startsWith('/admin')
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/registro')

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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
    } = await withTimeout(supabase.auth.getUser(), 5000)

    if (!user && (isPlayerRoute || isAdminRoute)) {
      // Redirect unauthenticated users to login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (user) {
      let role = null
      if (isAuthRoute || isAdminRoute) {
        const { data: profile } = await withTimeout(
          supabase.from('profiles').select('role').eq('id', user.id).single(),
          5000
        )
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
  } catch (err) {
    console.error('proxy: auth check failed, letting the request through', err)
    return NextResponse.next({ request })
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
