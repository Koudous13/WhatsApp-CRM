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

function formatWhatsAppText(text: string) {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
        const parts = line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
        return (
            <span key={i}>
                {parts.map((part, j) => {
                    if (part.startsWith('*') && part.endsWith('*')) {
                        return <strong key={j}>{part.slice(1, -1)}</strong>;
                    }
                    if (part.startsWith('_') && part.endsWith('_')) {
                        return <em key={j}>{part.slice(1, -1)}</em>;
                    }
                    return <span key={j}>{part}</span>;
                })}
                <br />
            </span>
        );
    });
}

export default function BroadcastPage() {
    const supabase = createClient()
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [showCreate, setShowCreate] = useState(false)
    const [sending, setSending] = useState(false)
    const [estimating, setEstimating] = useState(false)
    const [estimate, setEstimate] = useState<number | null>(null)

    // Formulaire
    const [name, setName] = useState('')
    const [bodyA, setBodyA] = useState('')
    const [bodyB, setBodyB] = useState('')
    const [activeVariant, setActiveVariant] = useState<'A' | 'B'>('A')
    const [filterProgramme, setFilterProgramme] = useState('Tous')
    const [filterOptIn, setFilterOptIn] = useState(true)
    const [errorMsg, setErrorMsg] = useState('')

    const currentBody = activeVariant === 'A' ? bodyA : bodyB

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
        // Pour l'instant l'API ne prend qu'un seul body, on envoie la variante active (ou on pourrait concaténer)
        if (!name.trim() || !currentBody.trim()) return
        setSending(true)
        try {
            const res = await fetch('/api/broadcast/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, body: currentBody, filterProgramme, filterOptIn }),
            })
            const data = await res.json()
            if (data.ok) {
                setShowCreate(false)
                setName(''); setBodyA(''); setBodyB(''); setEstimate(null); setErrorMsg('')
                loadCampaigns()
            } else {
                setErrorMsg(data.error || 'Erreur lors de la création')
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Erreur de connexion serveur')
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

            {/* Formulaire création & Aperçu WhatsApp */}
            {showCreate && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn">

                    {/* Colonne Gauche: Formulaire */}
                    <div className="glass-card p-6 space-y-4">
                        <h2 className="text-lg font-bold text-white mb-2">Nouvelle campagne</h2>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-2">Nom de la campagne *</label>
                                <input value={name} onChange={e => setName(e.target.value)}
                                    placeholder="Ex: Événement Rentrée"
                                    className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-2">Filtrer par programme (Audience)</label>
                                <select value={filterProgramme} onChange={e => { setFilterProgramme(e.target.value); setEstimate(null) }}
                                    className="w-full px-3 py-2 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}>
                                    {PROGRAMMES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Smart Segments */}
                        <div>
                            <label className="block text-xs text-slate-400 mb-2">⚡ Smart Segments (Raccourcis)</label>
                            <div className="flex gap-2 flex-wrap">
                                <button onClick={() => { setFilterProgramme('Tous'); setEstimate(null) }}
                                    className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-xs hover:bg-blue-500/30 transition-colors">
                                    🌍 Tous les inscrits
                                </button>
                                <button onClick={() => { setFilterProgramme('ClassTech'); setEstimate(null) }}
                                    className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-full text-xs hover:bg-purple-500/30 transition-colors">
                                    🎓 ClassTech Only
                                </button>
                                <button onClick={() => { setFilterProgramme('Ecole229'); setEstimate(null) }}
                                    className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs hover:bg-emerald-500/30 transition-colors">
                                    💻 Ecole229 Only
                                </button>
                            </div>
                        </div>

                        {/* A/B Testing Message Area */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-xs text-slate-400">Message (A/B Testing)</label>
                                <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
                                    <button onClick={() => setActiveVariant('A')}
                                        className={activeVariant === 'A' ? "px-3 py-1 text-[10px] font-bold rounded bg-blue-600 text-white shadow" : "px-3 py-1 text-[10px] font-bold rounded text-slate-400 hover:text-white"}>
                                        Version A
                                    </button>
                                    <button onClick={() => setActiveVariant('B')}
                                        className={activeVariant === 'B' ? "px-3 py-1 text-[10px] font-bold rounded bg-purple-600 text-white shadow" : "px-3 py-1 text-[10px] font-bold rounded text-slate-400 hover:text-white"}>
                                        Version B
                                    </button>
                                </div>
                            </div>

                            <textarea
                                value={activeVariant === 'A' ? bodyA : bodyB}
                                onChange={e => activeVariant === 'A' ? setBodyA(e.target.value.slice(0, 1024)) : setBodyB(e.target.value.slice(0, 1024))}
                                placeholder={activeVariant === 'A' ? "Bonjour ! 🎉 BloLab vous invite à..." : "Salut ! Ne manque pas notre prochain événement..."}
                                rows={6}
                                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none font-mono transition-colors"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: `1px solid ${activeVariant === 'A' ? 'rgba(37,99,235,0.5)' : 'rgba(147,51,234,0.5)'}` }}
                            />
                            <div className="flex justify-between items-center mt-1">
                                <p className="text-[10px] text-slate-500">
                                    Astuce: *gras*, _italique_
                                </p>
                                <p className="text-[10px] text-slate-500">
                                    {currentBody.length}/1024 caractères
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                            <button onClick={estimateAudience} disabled={estimating}
                                className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                                {estimating ? 'Calcul en cours...' : '📊 Calculer l\'audience'}
                            </button>
                            {estimate !== null && (
                                <span className="text-sm text-emerald-400 font-bold border-l border-blue-500/30 pl-4">
                                    ✅ ~{estimate} destinataires actifs
                                </span>
                            )}
                        </div>

                        {errorMsg && (
                            <div className="text-sm font-medium text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-500/20">
                                ❌ {errorMsg}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={createCampaign} disabled={sending || !name.trim() || !currentBody.trim()}
                                className="btn-primary flex items-center gap-2 font-bold shadow-lg shadow-blue-500/20">
                                {sending ? '⏳ Lancement...' : `🚀 Lancer la Version ${activeVariant}`}
                            </button>
                            <button onClick={() => setShowCreate(false)}
                                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/10">
                                Annuler
                            </button>
                        </div>
                    </div>

                    {/* Colonne Droite: Mockup Smartphone */}
                    <div className="flex justify-center items-center py-4">
                        <div className="relative w-[300px] h-[550px] bg-slate-900 rounded-[2.5rem] border-[6px] border-slate-800 overflow-hidden shadow-2xl flex flex-col">
                            {/* Header WhatsApp (Style natif) */}
                            <div className="bg-[#075e54] text-white px-4 py-3 drop-shadow-md z-10 flex items-center gap-3 w-full">
                                <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 text-xl border border-[#075e54]">
                                    🤖
                                </div>
                                <div className="leading-tight flex-1">
                                    <p className="font-bold text-sm truncate">Prospect (Aperçu)</p>
                                    <p className="text-[10px] text-emerald-100">en ligne</p>
                                </div>
                            </div>

                            {/* Corps du chat avec fond WhatsApp */}
                            <div className="flex-1 bg-[#efeae2] p-4 overflow-y-auto relative w-full"
                                style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>

                                <div className="text-center mb-4 text-[10px] opacity-70">
                                    <span className="bg-[#e1f2fb] text-[#111] px-3 py-1 rounded-lg shadow-sm">Aujourd'hui</span>
                                </div>

                                {/* Bulle Sortante */}
                                <div className="bg-[#dcf8c6] text-[#111] p-2.5 rounded-xl rounded-tr-sm shadow-sm max-w-[85%] ml-auto text-[13px] relative leading-[1.4] animate-fadeIn">
                                    {/* Petit badge variant */}
                                    <div className="absolute -top-3 -right-2 bg-slate-800 text-white text-[9px] font-bold px-1.5 rounded border border-slate-600 shadow-xl z-20">
                                        VAR {activeVariant}
                                    </div>
                                    <p className="whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word' }}>
                                        {currentBody.trim() ? formatWhatsAppText(currentBody) : <span className="text-slate-500 italic">Testez votre message {activeVariant} ici...</span>}
                                    </p>
                                    <div className="text-[10px] text-[#222]/50 text-right mt-1.5 flex items-center justify-end gap-1 font-medium z-10">
                                        12:00 <span className="text-[#53bdeb] text-sm leading-none drop-shadow-sm">✓✓</span>
                                    </div>
                                </div>
                            </div>

                            {/* Input bidon pour plus de réalisme */}
                            <div className="bg-[#f0f0f0] p-2 flex items-center gap-2">
                                <div className="flex-1 bg-white rounded-full h-9 flex items-center px-3 text-slate-400 text-xs">
                                    Message
                                </div>
                                <div className="w-9 h-9 rounded-full bg-[#00a884] text-white flex items-center justify-center text-sm shadow-sm">
                                    ➤
                                </div>
                            </div>
                        </div>
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

                        {/* Stats avec Barres de progression */}
                        <div className="flex flex-col gap-1 w-[200px] flex-shrink-0">
                            <div className="flex justify-between text-xs text-slate-400 mb-1">
                                <span className="font-semibold text-slate-300">Total: {c.total_recipients}</span>
                                <span>Envoyés: {c.sent_count}</span>
                            </div>

                            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex border border-slate-700/50">
                                {c.total_recipients > 0 ? (
                                    <>
                                        <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(c.delivered_count / c.total_recipients) * 100}%` }} title="Livrés" />
                                        <div className="bg-blue-500/60 h-full transition-all" style={{ width: `${((c.sent_count - c.delivered_count - c.failed_count) / c.total_recipients) * 100}%` }} title="En cours de livraison" />
                                        <div className="bg-red-500 h-full transition-all" style={{ width: `${(c.failed_count / c.total_recipients) * 100}%` }} title="Échoués" />
                                    </>
                                ) : (
                                    <div className="bg-slate-700 w-full h-full" />
                                )}
                            </div>

                            <div className="flex justify-between text-[10px] font-bold mt-1">
                                <span className={c.delivered_count > 0 ? "text-emerald-400" : "text-slate-500"}>{c.delivered_count} ✔✔ Livrés</span>
                                <span className={c.failed_count > 0 ? "text-red-400" : "text-slate-500"}>{c.failed_count} ❌ Échoués</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
