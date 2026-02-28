'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeDate } from '@/lib/utils'

type Campaign = {
    id: string
    name: string
    body: string
    status: string
    scheduled_at: string | null
    created_at: string
    total_recipients: number
    sent_count: number
    delivered_count: number
    failed_count: number
}

const PROGRAMMES = ['Tous', 'ClassTech', 'Ecole229', 'KMC', 'Incubateur', 'FabLab']

export default function BroadcastPage() {
    const supabase = createClient()
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [showCreate, setShowCreate] = useState(false)
    const [sending, setSending] = useState(false)
    const [estimating, setEstimating] = useState(false)
    const [estimate, setEstimate] = useState<number | null>(null)

    // Formulaire
    const [name, setName] = useState('')
    const [body, setBody] = useState('')
    const [filterProgramme, setFilterProgramme] = useState('Tous')
    const [filterOptIn, setFilterOptIn] = useState(true)

    useEffect(() => { loadCampaigns() }, [])

    async function loadCampaigns() {
        const { data } = await supabase
            .from('broadcasts')
            .select('id, name, body, status, scheduled_at, created_at, total_recipients, sent_count, delivered_count, failed_count')
            .order('created_at', { ascending: false })
            .limit(20)
        setCampaigns((data as any) ?? [])
    }

    async function estimateAudience() {
        setEstimating(true)
        let query = supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true }).eq('opt_in', true)
        if (filterProgramme !== 'Tous') query = query.eq('programme_recommande', filterProgramme)
        const { count } = await query
        setEstimate(count ?? 0)
        setEstimating(false)
    }

    async function createCampaign() {
        if (!name.trim() || !body.trim()) return
        setSending(true)
        try {
            const res = await fetch('/api/broadcast/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, body, filterProgramme, filterOptIn }),
            })
            const data = await res.json()
            if (data.ok) {
                setShowCreate(false)
                setName(''); setBody(''); setEstimate(null)
                loadCampaigns()
            }
        } finally {
            setSending(false)
        }
    }

    const statusColors: Record<string, string> = {
        draft: 'text-slate-400',
        scheduled: 'text-blue-400',
        running: 'text-amber-400',
        completed: 'text-emerald-400',
        failed: 'text-red-400',
    }

    return (
        <div className="p-8 max-w-6xl space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white">Broadcast</h1>
                    <p className="text-sm text-slate-400 mt-1">Envoyez des campagnes WhatsApp à vos prospects</p>
                </div>
                <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
                    {showCreate ? '✕ Annuler' : '+ Nouvelle campagne'}
                </button>
            </div>

            {/* Formulaire création */}
            {showCreate && (
                <div className="glass-card p-6 space-y-4 animate-fadeIn">
                    <h2 className="text-lg font-bold text-white">Nouvelle campagne</h2>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-2">Nom de la campagne *</label>
                            <input value={name} onChange={e => setName(e.target.value)}
                                placeholder="Ex: Rentrée ClassTech Juillet"
                                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 mb-2">Filtrer par programme</label>
                            <select value={filterProgramme} onChange={e => { setFilterProgramme(e.target.value); setEstimate(null) }}
                                className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}>
                                {PROGRAMMES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-2">Message * ({body.length}/1024 caractères)</label>
                        <textarea value={body} onChange={e => setBody(e.target.value.slice(0, 1024))}
                            placeholder="Bonjour ! 🎉 BloLab vous invite à..."
                            rows={5}
                            className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                            style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                        />
                    </div>

                    <div className="flex items-center gap-4">
                        <button onClick={estimateAudience} disabled={estimating}
                            className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                            {estimating ? '...' : '📊 Estimer l\'audience'}
                        </button>
                        {estimate !== null && (
                            <span className="text-sm text-emerald-400 font-medium">
                                ✅ ~{estimate} destinataires opt-in
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>⚠️</span>
                        <span>L'envoi respecte un rate-limit de 1 message/1-2s pour éviter les blocages WhatsApp.</span>
                    </div>

                    <div className="flex gap-3">
                        <button onClick={createCampaign} disabled={sending || !name || !body}
                            className="btn-primary flex items-center gap-2">
                            {sending ? '⏳ Création...' : '🚀 Créer et lancer'}
                        </button>
                        <button onClick={() => setShowCreate(false)}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                            Annuler
                        </button>
                    </div>
                </div>
            )}

            {/* Liste campagnes */}
            <div className="space-y-3">
                {campaigns.length === 0 && (
                    <div className="glass-card p-8 text-center text-slate-500">
                        Aucune campagne pour l'instant.<br />
                        <span className="text-sm">Créez votre première campagne broadcast !</span>
                    </div>
                )}
                {campaigns.map(c => (
                    <div key={c.id} className="glass-card p-5 flex items-center gap-6">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="font-semibold text-white">{c.name}</p>
                                <span className={`text-xs font-medium ${statusColors[c.status] ?? 'text-slate-400'}`}>
                                    • {c.status}
                                </span>
                            </div>
                            <p className="text-sm text-slate-400 mt-1 truncate">{c.body.slice(0, 80)}...</p>
                            <p className="text-xs text-slate-600 mt-1">{formatRelativeDate(c.created_at)}</p>
                        </div>

                        {/* Stats */}
                        <div className="flex gap-6 text-center flex-shrink-0">
                            <div>
                                <p className="text-lg font-bold text-white">{c.total_recipients}</p>
                                <p className="text-xs text-slate-500">Dest.</p>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-emerald-400">{c.sent_count}</p>
                                <p className="text-xs text-slate-500">Envoyés</p>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-blue-400">{c.delivered_count}</p>
                                <p className="text-xs text-slate-500">Livrés</p>
                            </div>
                            <div>
                                <p className="text-lg font-bold text-red-400">{c.failed_count}</p>
                                <p className="text-xs text-slate-500">Échoués</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
