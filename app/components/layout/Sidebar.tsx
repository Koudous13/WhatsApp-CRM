'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createBrowserClient } from '@supabase/ssr'

const NAV_ITEMS = [
    { href: '/programmes', icon: '📂', label: 'Programmes' },
    { href: '/inbox', icon: '💬', label: 'Inbox' },
    { href: '/broadcast', icon: '📢', label: 'Broadcast' },
    { href: '/contacts', icon: '👥', label: 'Contacts' },
    { href: '/knowledge', icon: '📚', label: 'Base de connaissances' },
    { href: '/settings', icon: '⚙️', label: 'Paramètres' },
]

export default function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()

    async function handleLogout() {
        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <aside className="fixed left-0 top-0 h-full w-64 flex flex-col z-50"
            style={{
                background: 'rgba(13, 10, 26, 0.92)',
                borderRight: '1px solid rgba(139, 92, 246, 0.2)',
                backdropFilter: 'blur(20px) saturate(180%)',
            }}>

            {/* Logo */}
            <div className="p-6 border-b" style={{ borderColor: 'rgba(139, 92, 246, 0.15)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-xl">
                        🤖
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm">BloLab CRM</p>
                        <p className="text-xs text-slate-500">Agent WhatsApp IA</p>
                    </div>
                </div>

                {/* Session badge */}
                <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse-dot" />
                    <span className="text-xs text-violet-300 font-medium">WhatsApp connecté</span>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {NAV_ITEMS.map(({ href, icon, label }) => {
                    const active = pathname.startsWith(href)
                    return (
                        <Link key={href} href={href}
                            className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                                active
                                    ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-violet-200'
                            )}>
                            <span className="text-lg">{icon}</span>
                            <span>{label}</span>
                            {active && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer + Logout */}
            <div className="p-4 border-t space-y-3" style={{ borderColor: 'rgba(139, 92, 246, 0.15)' }}>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                >
                    <span className="text-lg">🚪</span>
                    <span>Déconnexion</span>
                </button>
                <p className="text-xs text-slate-600 text-center">BloLab • Cotonou & Parakou 🇧🇯</p>
            </div>
        </aside>
    )
}
