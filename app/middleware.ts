import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/inbox', '/contacts', '/analytics', '/broadcast', '/knowledge', '/programmes', '/settings']

export async function middleware(req: NextRequest) {
    const res = NextResponse.next()
    const pathname = req.nextUrl.pathname

    // Ignorer les routes API et assets
    if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
        return res
    }

    // Vérifier si la route est protégée
    const isProtected = PROTECTED_PATHS.some(p => pathname.startsWith(p))
    if (!isProtected) return res

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => req.cookies.getAll(),
                setAll: (cookiesToSet) => {
                    cookiesToSet.forEach(({ name, value, options }) =>
                        res.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.redirect(new URL('/login', req.url))
    }

    return res
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
