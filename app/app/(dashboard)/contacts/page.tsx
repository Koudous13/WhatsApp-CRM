'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getInitials, getStatutColor, getScoreColor, truncate, cn } from '@/lib/utils'

type Prospect = {
    id: number
    chat_id: string
    prenom: string | null
    nom: string | null
    ville: string | null
    profil_type: string | null
    programme_recommande: string | null
    statut_conversation: string
    etape_parcours: string | null
    score_engagement: number
    niveau_urgence: string | null
    opt_in: boolean
    date_derniere_activite: string | null
    nombre_interactions: number
    interet_principal: string | null
    objectif: string | null
    budget_mentionne: string | null
    notes: string | null
    notes_auto: string | null
}

const PROGRAMMES = ['Tous', 'ClassTech', 'Ecole229', 'KMC', 'Incubateur', 'FabLab']
const STATUTS = ['Tous', 'Nouveau', 'Qualifie', 'Proposition faite', 'Interesse', 'Inscription', 'Froid']

export default function ContactsPage() {
    const supabase = createClient()
    const [prospects, setProspects] = useState<Prospect[]>([])
    const [selected, setSelected] = useState<Prospect | null>(null)
    const [search, setSearch] = useState('')
    const [filterProgramme, setFilterProgramme] = useState('Tous')
    const [filterStatut, setFilterStatut] = useState('Tous')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        load()
    }, [])

    async function load() {
        setLoading(true)
        const { data } = await supabase
            .from('Profil_Prospects')
            .select('id, chat_id, prenom, nom, ville, profil_type, programme_recommande, statut_conversation, etape_parcours, score_engagement, niveau_urgence, opt_in, date_derniere_activite, nombre_interactions, interet_principal, objectif, budget_mentionne, notes, notes_auto')
            .order('score_engagement', { ascending: false })
            .limit(200)
        setProspects((data as any) ?? [])
        setLoading(false)
    }

    const filtered = prospects.filter(p => {
        const name = `${p.prenom ?? ''} ${p.nom ?? ''} ${p.chat_id} ${p.ville ?? ''}`.toLowerCase()
        const matchSearch = name.includes(search.toLowerCase())
        const matchProg = filterProgramme === 'Tous' || p.programme_recommande === filterProgramme
        const matchStatut = filterStatut === 'Tous' || p.statut_conversation === filterStatut
        return matchSearch && matchProg && matchStatut
    })

    return (
        <div className="flex h-screen">
            {/* ── Liste contacts ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header + filtres */}
                <div className="p-6 border-b" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-xl font-bold text-white">Contacts</h1>
                            <p className="text-sm text-slate-400">{prospects.length} prospects</p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex gap-3 flex-wrap items-center">
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Rechercher un contact..."
                                className="flex-1 min-w-48 px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                            />
                            <div className="flex bg-slate-800/30 rounded-lg p-1 flex-wrap gap-1" style={{ border: '1px solid rgba(30, 58, 95, 0.6)' }}>
                                <button onClick={() => { setFilterStatut('Tous'); setFilterProgramme('Tous') }} className={cn("px-4 py-1.5 rounded-md text-xs font-semibold transition-all", filterStatut === 'Tous' && filterProgramme === 'Tous' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>Tous</button>
                                <button onClick={() => { setFilterStatut('Qualifie'); setFilterProgramme('Tous') }} className={cn("px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-2", filterStatut === 'Qualifie' ? "bg-emerald-500/20 text-emerald-400 shadow-sm border border-emerald-500/30" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>🔥 Hot Leads</button>
                                <button onClick={() => { setFilterStatut('Tous'); setFilterProgramme('ClassTech') }} className={cn("px-4 py-1.5 rounded-md text-xs font-semibold transition-all", filterProgramme === 'ClassTech' ? "bg-blue-500/20 text-blue-400 shadow-sm border border-blue-500/30" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>📚 ClassTech</button>
                                <button onClick={() => { setFilterStatut('Froid'); setFilterProgramme('Tous') }} className={cn("px-4 py-1.5 rounded-md text-xs font-semibold transition-all", filterStatut === 'Froid' ? "bg-slate-800 text-slate-300 shadow-sm border border-slate-600/50" : "text-slate-400 hover:text-white hover:bg-slate-700/50")}>❄️ Froids</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Chargement...</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0" style={{ background: 'rgba(10, 15, 30, 0.95)' }}>
                                <tr className="text-slate-400 text-xs uppercase">
                                    <th className="text-left px-6 py-3">Contact</th>
                                    <th className="text-left px-4 py-3">Programme</th>
                                    <th className="text-left px-4 py-3">Statut</th>
                                    <th className="text-left px-4 py-3">Score</th>
                                    <th className="text-left px-4 py-3">Interactions</th>
                                    <th className="text-left px-4 py-3">Urgence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => {
                                    const name = p.prenom ? `${p.prenom} ${p.nom ?? ''}`.trim() : p.chat_id
                                    return (
                                        <tr key={p.id}
                                            onClick={() => setSelected(p)}
                                            className="border-b cursor-pointer group hover:bg-white/5 transition-colors relative"
                                            style={{ borderColor: 'rgba(30, 58, 95, 0.3)' }}>
                                            <td className="px-6 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600
                            flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                                                        {getInitials(p.prenom ?? undefined, p.nom ?? undefined)}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-white">{name}</p>
                                                        <p className="text-xs text-slate-500">{p.chat_id}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
                                                    {p.programme_recommande ?? '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`badge ${getStatutColor(p.statut_conversation)}`}>
                                                    {p.statut_conversation}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-2 rounded-full bg-slate-800 overflow-hidden">
                                                        <div className="h-full rounded-full transition-all"
                                                            style={{
                                                                width: `${p.score_engagement}%`,
                                                                background: p.score_engagement >= 80 ? '#34d399' : p.score_engagement >= 50 ? '#fbbf24' : '#64748b'
                                                            }} />
                                                    </div>
                                                    <span className={`font-bold text-xs ${getScoreColor(p.score_engagement)}`}>
                                                        {p.score_engagement}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400">{p.nombre_interactions}</td>
                                            <td className="px-4 py-3 relative">
                                                {p.niveau_urgence && (
                                                    <span className={`text-xs ${p.niveau_urgence === 'Élevé' ? 'text-red-400' : p.niveau_urgence === 'Moyen' ? 'text-amber-400' : 'text-slate-500'}`}>
                                                        {p.niveau_urgence === 'Élevé' ? '🔴' : p.niveau_urgence === 'Moyen' ? '🟡' : '🟢'} {p.niveau_urgence}
                                                    </span>
                                                )}
                                                {/* Hover Action */}
                                                <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <a href={`/inbox?chat_id=${p.chat_id}`}
                                                        className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-blue-500 hover:text-white flex items-center justify-center transition-all shadow-lg"
                                                        onClick={(e) => e.stopPropagation()}>
                                                        💬
                                                    </a>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* ── Panneau détail contact ─────────────────────────────── */}
            {selected && (
                <div className="w-80 border-l overflow-y-auto p-5 space-y-4 animate-fadeIn"
                    style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                    <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white text-sm mb-2">
                        ← Fermer
                    </button>

                    {/* Avatar */}
                    <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600
              flex items-center justify-center text-xl font-bold text-white mx-auto mb-2">
                            {getInitials(selected.prenom ?? undefined, selected.nom ?? undefined)}
                        </div>
                        <p className="font-bold text-white">{selected.prenom ? `${selected.prenom} ${selected.nom ?? ''}`.trim() : selected.chat_id}</p>
                        <p className="text-xs text-slate-400 mt-1">{selected.chat_id}</p>
                        <span className={`badge mt-2 ${getStatutColor(selected.statut_conversation)}`}>
                            {selected.statut_conversation}
                        </span>
                    </div>

                    {/* Score */}
                    <div className="glass-card p-4 text-center">
                        <p className="text-xs text-slate-400 mb-1">Score engagement</p>
                        <p className={`text-4xl font-black ${getScoreColor(selected.score_engagement)}`}>
                            {selected.score_engagement}
                        </p>
                        <p className="text-xs text-slate-500">/100</p>
                    </div>

                    {/* Infos */}
                    {[
                        ['🏷️ Profil', selected.profil_type],
                        ['🎓 Programme', selected.programme_recommande],
                        ['📍 Ville', selected.ville],
                        ['🎯 Objectif', selected.objectif],
                        ['💰 Budget', selected.budget_mentionne],
                        ['📍 Étape', selected.etape_parcours],
                        ['❤️ Intérêt', selected.interet_principal],
                        ['🔄 Interactions', String(selected.nombre_interactions)],
                    ].map(([label, val]) => val && (
                        <div key={label} className="flex items-start gap-2">
                            <span className="text-xs text-slate-400 w-28 flex-shrink-0">{label}</span>
                            <span className="text-xs text-white">{val}</span>
                        </div>
                    ))}

                    {/* Notes IA */}
                    {selected.notes_auto && (
                        <div className="glass-card p-3">
                            <p className="text-xs text-slate-400 mb-1">🤖 Notes IA</p>
                            <p className="text-xs text-slate-300">{truncate(selected.notes_auto, 200)}</p>
                        </div>
                    )}
                    {selected.notes && (
                        <div className="glass-card p-3">
                            <p className="text-xs text-slate-400 mb-1">📝 Notes admin</p>
                            <p className="text-xs text-slate-300">{selected.notes}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
