'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
    { href: '/inbox', icon: '💬', label: 'Inbox' },
    { href: '/contacts', icon: '👥', label: 'Contacts' },
    { href: '/broadcast', icon: '📢', label: 'Broadcast' },
    { href: '/analytics', icon: '📊', label: 'Analytics' },
    { href: '/knowledge', icon: '📚', label: 'Base de connaissances' },
    { href: '/settings', icon: '⚙️', label: 'Paramètres' },
]

export default function Sidebar() {
    const pathname = usePathname()

    return (
        <aside className="fixed left-0 top-0 h-full w-64 flex flex-col z-50"
            style={{
                background: 'rgba(10, 15, 30, 0.95)',
                borderRight: '1px solid rgba(30, 58, 95, 0.6)',
                backdropFilter: 'blur(12px)',
            }}>

            {/* Logo */}
            <div className="p-6 border-b" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30
            flex items-center justify-center text-xl">
                        🤖
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm">BloLab CRM</p>
                        <p className="text-xs text-slate-500">Agent WhatsApp IA</p>
                    </div>
                </div>

                {/* Session badge */}
                <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
                    <span className="text-xs text-emerald-400 font-medium">WhatsApp connecté</span>
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
                                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                            )}>
                            <span className="text-lg">{icon}</span>
                            <span>{label}</span>
                            {active && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                <p className="text-xs text-slate-600 text-center">
                    BloLab • Cotonou & Parakou 🇧🇯
                </p>
            </div>
        </aside>
    )
}
