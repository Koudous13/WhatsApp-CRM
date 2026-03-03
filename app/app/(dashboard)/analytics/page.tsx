'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

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

function StatCard({ icon, label, value, sub, color = 'text-white', trend }: {
    icon: string; label: string; value: string | number; sub?: string; color?: string; trend?: { value: string, positive: boolean }
}) {
    return (
        <div className="glass-card p-6 hover:-translate-y-1 transition-transform relative overflow-hidden group border border-slate-700/40 hover:border-blue-500/40">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-colors pointer-events-none" />
            <div className="flex items-start justify-between relative z-10">
                <div>
                    <p className="text-sm font-semibold text-slate-400 mb-2">{label}</p>
                    <div className="flex items-baseline gap-3">
                        <p className={`text-4xl font-black tracking-tight ${color}`}>{value}</p>
                        {trend && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm ${trend.positive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                                {trend.positive ? '↗' : '↘'} {trend.value}
                            </span>
                        )}
                    </div>
                    {sub && <p className="text-xs text-slate-500 mt-2 font-medium">{sub}</p>}
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-800/40 border border-slate-700/50 flex items-center justify-center text-2xl shadow-inner">
                    {icon}
                </div>
            </div>
        </div>
    )
}

export default function AnalyticsPage() {
    const supabase = createClient()
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)
    const [period, setPeriod] = useState('7d')

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
        <div className="p-8 space-y-8 max-w-7xl animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Analytics & Performance</h1>
                    <p className="text-sm text-slate-400 mt-1">Gérez la croissance et contrôlez les résultats de l'IA</p>
                </div>
                <div className="flex bg-slate-800/40 p-1.5 rounded-xl border border-slate-700/50 shadow-inner">
                    <button onClick={() => setPeriod('today')} className={cn("px-5 py-2 text-xs font-bold rounded-lg transition-all", period === 'today' ? "bg-blue-600 text-white shadow-lg pointer-events-none" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>Aujourd'hui</button>
                    <button onClick={() => setPeriod('7d')} className={cn("px-5 py-2 text-xs font-bold rounded-lg transition-all", period === '7d' ? "bg-blue-600 text-white shadow-lg pointer-events-none" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>7 Jours</button>
                    <button onClick={() => setPeriod('30d')} className={cn("px-5 py-2 text-xs font-bold rounded-lg transition-all", period === '30d' ? "bg-blue-600 text-white shadow-lg pointer-events-none" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>30 Jours</button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon="👥" label="Total Contacts" value={stats?.totalContacts ?? 0} trend={{ value: "12%", positive: true }} />
                <StatCard icon="✨" label="Créés (Période)" value={stats?.newToday ?? 0} color="text-blue-400" trend={{ value: "5%", positive: true }} sub="Contacts opt-in" />
                <StatCard icon="🤖" label="Sessions IA" value={stats?.conversationsActives ?? 0} color="text-emerald-400" trend={{ value: "3.2%", positive: true }} sub="IA en cours de qualification" />
                <StatCard icon="⚡" label="Escalades" value={stats?.escalations ?? 0} color="text-amber-400" trend={{ value: "1.5%", positive: false }} sub="En attente d'un humain" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Score moyen */}
                <div className="glass-card p-8 text-center flex flex-col justify-center items-center relative overflow-hidden group">
                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <p className="text-slate-400 text-sm font-semibold mb-4 tracking-wide uppercase">Score global d'engagement</p>
                    <div className="relative">
                        <p className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-emerald-600 relative z-10">{stats?.avgScore ?? 0}</p>
                    </div>
                    <p className="text-slate-500 text-sm mt-3 font-medium border border-slate-700/50 px-3 py-1 rounded-full bg-slate-800/30">/ 100 max</p>
                </div>

                {/* Top programmes */}
                <div className="glass-card p-6 lg:col-span-2">
                    <p className="text-slate-400 text-sm font-bold mb-5 flex items-center gap-2">🎓 <span className="uppercase tracking-wide">Top recommandations de l'IA</span></p>
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
                <div className="flex items-center justify-between mb-8">
                    <p className="text-slate-400 text-sm font-bold flex items-center gap-2">📨 <span className="uppercase tracking-wide">Trafic Entrant</span></p>
                    <span className="text-xs font-semibold px-2 py-1 bg-blue-500/10 text-blue-400 rounded-md border border-blue-500/20">Semaine</span>
                </div>
                {stats?.messagesParJour.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-dashed border-slate-700/50">
                        Aucun message reçu cette semaine
                    </div>
                ) : (
                    <div className="flex items-end gap-3 h-40 mt-6 px-2">
                        {stats?.messagesParJour.map(d => {
                            const pct = Math.round((d.count / maxMessages) * 100)
                            const dayLabel = new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })
                            return (
                                <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group relative">
                                    <div className="w-full flex-1 flex items-end">
                                        <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600/20 to-blue-400/40 border-t-2 border-x border-blue-400/50 group-hover:from-blue-600/40 group-hover:to-blue-400/60 transition-all relative"
                                            style={{ height: `${Math.max(pct, 5)}%` }}>
                                            {/* Tooltip Hover */}
                                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl border border-slate-700">
                                                {d.count} messages
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider bg-slate-900/50 px-2 py-1 rounded w-full text-center truncate">{dayLabel}</span>
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
