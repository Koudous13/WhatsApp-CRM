'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Stats = {
    totalContacts: number
    newToday: number
    conversationsActives: number
    escalations: number
    avgScore: number
    topProgrammes: { name: string; count: number }[]
    statuts: { name: string; count: number }[]
    messagesParJour: { date: string; count: number }[]
}

function StatCard({ icon, label, value, sub, color = 'text-white' }: {
    icon: string; label: string; value: string | number; sub?: string; color?: string
}) {
    return (
        <div className="glass-card p-5">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-slate-400 mb-1">{label}</p>
                    <p className={`text-3xl font-black ${color}`}>{value}</p>
                    {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
                </div>
                <span className="text-2xl">{icon}</span>
            </div>
        </div>
    )
}

export default function AnalyticsPage() {
    const supabase = createClient()
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const today = new Date().toISOString().split('T')[0]
            const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

            const [
                { count: totalContacts },
                { count: newToday },
                { count: conversationsActives },
                { count: escalations },
                { data: scoreData },
                { data: programmesData },
                { data: statutsData },
                { data: messagesData },
            ] = await Promise.all([
                supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true }),
                supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true })
                    .gte('created_at', today),
                supabase.from('conversations').select('*', { count: 'exact', head: true })
                    .eq('status', 'ai_active'),
                supabase.from('conversations').select('*', { count: 'exact', head: true })
                    .eq('status', 'escalated'),
                supabase.from('Profil_Prospects').select('score_engagement'),
                supabase.from('Profil_Prospects').select('programme_recommande').not('programme_recommande', 'is', null),
                supabase.from('Profil_Prospects').select('statut_conversation'),
                supabase.from('messages').select('created_at').gte('created_at', weekAgo).eq('direction', 'inbound'),
            ])

            const avgScore = scoreData?.length
                ? Math.round(scoreData.reduce((sum: number, r: any) => sum + (r.score_engagement || 0), 0) / scoreData.length)
                : 0

            // Top programmes
            const progCount: Record<string, number> = {}
            programmesData?.forEach((r: any) => {
                progCount[r.programme_recommande] = (progCount[r.programme_recommande] || 0) + 1
            })
            const topProgrammes = Object.entries(progCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, count]) => ({ name, count }))

            // Statuts
            const statCount: Record<string, number> = {}
            statutsData?.forEach((r: any) => {
                statCount[r.statut_conversation] = (statCount[r.statut_conversation] || 0) + 1
            })
            const statuts = Object.entries(statCount).map(([name, count]) => ({ name, count }))

            // Messages par jour (7 derniers jours)
            const dayCount: Record<string, number> = {}
            messagesData?.forEach((r: any) => {
                const day = r.created_at?.split('T')[0]
                if (day) dayCount[day] = (dayCount[day] || 0) + 1
            })
            const messagesParJour = Object.entries(dayCount)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, count]) => ({ date, count }))

            setStats({
                totalContacts: totalContacts ?? 0,
                newToday: newToday ?? 0,
                conversationsActives: conversationsActives ?? 0,
                escalations: escalations ?? 0,
                avgScore,
                topProgrammes,
                statuts,
                messagesParJour,
            })
            setLoading(false)
        }
        load()
    }, [])

    if (loading) return (
        <div className="p-8 text-center text-slate-500">Chargement des analytics...</div>
    )

    const maxMessages = Math.max(...(stats?.messagesParJour.map(d => d.count) ?? [1]), 1)

    return (
        <div className="p-8 space-y-8 max-w-6xl">
            <h1 className="text-2xl font-black text-white">Analytics</h1>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon="👥" label="Total contacts" value={stats?.totalContacts ?? 0} />
                <StatCard icon="✨" label="Nouveaux aujourd'hui" value={stats?.newToday ?? 0} color="text-blue-400" />
                <StatCard icon="🤖" label="IA active" value={stats?.conversationsActives ?? 0} color="text-emerald-400" />
                <StatCard icon="⚡" label="Escalades" value={stats?.escalations ?? 0} color="text-amber-400" sub="En attente humain" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Score moyen */}
                <div className="glass-card p-6 text-center">
                    <p className="text-slate-400 text-sm mb-2">Score engagement moyen</p>
                    <p className="text-6xl font-black text-emerald-400">{stats?.avgScore ?? 0}</p>
                    <p className="text-slate-500 text-sm mt-1">/100</p>
                </div>

                {/* Top programmes */}
                <div className="glass-card p-6 lg:col-span-2">
                    <p className="text-slate-400 text-sm font-medium mb-4">🎓 Top programmes recommandés</p>
                    <div className="space-y-3">
                        {stats?.topProgrammes.length === 0 && (
                            <p className="text-slate-500 text-sm">Aucune donnée</p>
                        )}
                        {stats?.topProgrammes.map(p => {
                            const max = stats.topProgrammes[0]?.count || 1
                            const pct = Math.round((p.count / max) * 100)
                            return (
                                <div key={p.name}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-white font-medium">{p.name}</span>
                                        <span className="text-slate-400">{p.count} prospects</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                                        <div className="h-full rounded-full bg-blue-500 transition-all"
                                            style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* Messages par jour */}
            <div className="glass-card p-6">
                <p className="text-slate-400 text-sm font-medium mb-4">📨 Messages entrants — 7 derniers jours</p>
                {stats?.messagesParJour.length === 0 ? (
                    <p className="text-slate-500 text-sm">Aucun message cette semaine</p>
                ) : (
                    <div className="flex items-end gap-3 h-32">
                        {stats?.messagesParJour.map(d => {
                            const pct = Math.round((d.count / maxMessages) * 100)
                            const dayLabel = new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })
                            return (
                                <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
                                    <span className="text-xs text-slate-400">{d.count}</span>
                                    <div className="w-full rounded-t-md bg-blue-500/30 border-t border-x border-blue-500/50 transition-all"
                                        style={{ height: `${Math.max(pct, 5)}%` }} />
                                    <span className="text-xs text-slate-500">{dayLabel}</span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Statuts pipeline */}
            <div className="glass-card p-6">
                <p className="text-slate-400 text-sm font-medium mb-4">🏷️ Pipeline commercial</p>
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
                    {stats?.statuts.map(s => (
                        <div key={s.name} className="text-center p-3 rounded-xl"
                            style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(30, 58, 95, 0.4)' }}>
                            <p className="text-2xl font-black text-white">{s.count}</p>
                            <p className="text-xs text-slate-400 mt-1">{s.name}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
