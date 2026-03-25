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

const PROGRAMMES = ['ClassTech', 'Ecole229', 'KMC', 'Incubateur', 'FabLab']
const STATUTS = ['Nouveau', 'Qualifie', 'Proposition faite', 'Interesse', 'Inscription', 'Froid']

type SmartSegment = {
    id: string
    name: string
    filters: {
        programmes: string[]
        statuts: string[]
        scoreMin: number
        scoreMax: number
    }
}

export default function ContactsPage() {
    const supabase = createClient()
    const [prospects, setProspects] = useState<Prospect[]>([])
    const [selected, setSelected] = useState<Prospect | null>(null)
    const [search, setSearch] = useState('')
    const [filterProgrammes, setFilterProgrammes] = useState<string[]>([])
    const [filterStatuts, setFilterStatuts] = useState<string[]>([])
    const [filterScoreMin, setFilterScoreMin] = useState(0)
    const [filterScoreMax, setFilterScoreMax] = useState(100)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [loading, setLoading] = useState(true)
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban')
    const [draggingId, setDraggingId] = useState<number | null>(null)
    const [updatingId, setUpdatingId] = useState<number | null>(null)
    const [isLocked, setIsLocked] = useState(true)
    const [segments, setSegments] = useState<SmartSegment[]>([])
    const [savingSegment, setSavingSegment] = useState(false)
    const [segmentName, setSegmentName] = useState('')
    const [showSaveSegment, setShowSaveSegment] = useState(false)


    // Colonnes du Kanban
    const KANBAN_COLUMNS = ['Nouveau', 'Qualifie', 'Interesse', 'Proposition faite', 'Inscription', 'Froid']

    useEffect(() => {
        load()
        loadSegments()
    }, [])
    async function loadSegments() {
        const { data } = await supabase.from('Smart_Segments').select('*').order('created_at', { ascending: false })
        setSegments((data as any) ?? [])
    }

    function toggleProgramme(p: string) {
        setFilterProgrammes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
    }

    function toggleStatut(s: string) {
        setFilterStatuts(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    }

    function resetFilters() {
        setFilterProgrammes([])
        setFilterStatuts([])
        setFilterScoreMin(0)
        setFilterScoreMax(100)
        setSearch('')
    }

    function applySegment(seg: SmartSegment) {
        setFilterProgrammes(seg.filters.programmes)
        setFilterStatuts(seg.filters.statuts)
        setFilterScoreMin(seg.filters.scoreMin)
        setFilterScoreMax(seg.filters.scoreMax)
    }

    async function saveSegment() {
        if (!segmentName.trim()) return
        setSavingSegment(true)
        const filters = { programmes: filterProgrammes, statuts: filterStatuts, scoreMin: filterScoreMin, scoreMax: filterScoreMax }
        try {
            const { error } = await supabase.from('Smart_Segments').upsert({ name: segmentName.trim(), filters }, { onConflict: 'name' })
            if (error) {
                alert(`Erreur sauvegarde: ${error.message}\n\nVérifiez que la table Smart_Segments existe dans Supabase.`)
                console.error('saveSegment error:', error)
            } else {
                setSegmentName('')
                setShowSaveSegment(false)
                loadSegments()
            }
        } catch (e: any) {
            alert(`Erreur inattendue: ${e.message}`)
        } finally {
            setSavingSegment(false)
        }
    }

    async function deleteSegment(id: string) {
        await supabase.from('Smart_Segments').delete().eq('id', id)
        loadSegments()
    }

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
        const nameStr = `${p.prenom ?? ''} ${p.nom ?? ''} ${p.chat_id} ${p.ville ?? ''}`.toLowerCase()
        const matchSearch = nameStr.includes(search.toLowerCase())
        const matchProg = filterProgrammes.length === 0 || filterProgrammes.includes(p.programme_recommande ?? '')
        const matchStatut = filterStatuts.length === 0 || filterStatuts.includes(p.statut_conversation)
        const matchScore = p.score_engagement >= filterScoreMin && p.score_engagement <= filterScoreMax
        return matchSearch && matchProg && matchStatut && matchScore
    })

    // Handler Drag & Drop
    const handleDragStart = (e: React.DragEvent, id: number) => {
        if (isLocked) {
           e.preventDefault()
           return
        }
        setDraggingId(id)
        e.dataTransfer.setData('text/plain', id.toString())
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault() // Nécessaire pour autoriser le drop
        e.dataTransfer.dropEffect = 'move'
    }

    const handleDrop = async (e: React.DragEvent, newStatus: string) => {
        e.preventDefault()
        const idStr = e.dataTransfer.getData('text/plain')
        if (!idStr) return
        const id = parseInt(idStr, 10)

        // Trouver le prospect
        const prospect = prospects.find(p => p.id === id)
        if (!prospect || prospect.statut_conversation === newStatus) {
            setDraggingId(null)
            return
        }

        // Optimistic UI Update
        setUpdatingId(id)
        setProspects(prev => prev.map(p => p.id === id ? { ...p, statut_conversation: newStatus } : p))
        setDraggingId(null)

        // Supabase DB Update
        try {
            const { error } = await supabase
                .from('Profil_Prospects')
                .update({ statut_conversation: newStatus })
                .eq('id', id)
            if (error) throw error
        } catch (err) {
            console.error('Erreur Drag&Drop', err)
            // Rollback si erreur (recharger tout)
            load()
        } finally {
            setUpdatingId(null)
        }
    }

    return (
        <div className="flex h-screen">
            {/* ── Liste contacts ─────────────────────────────────────── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header + filtres */}
                <div className="p-6 border-b" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-4 mb-1">
                                <h1 className="text-xl font-bold text-white">Contacts</h1>
                                <div className="flex bg-slate-800/50 rounded-lg p-1 border border-slate-700/50 ml-4">
                                    <button onClick={() => setViewMode('kanban')} className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", viewMode === 'kanban' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Kanban</button>
                                    <button onClick={() => setViewMode('list')} className={cn("px-3 py-1 text-xs font-bold rounded-md transition-all", viewMode === 'list' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>Liste</button>
                                </div>
                            </div>
                            <p className="text-sm text-slate-400">
                                {prospects.length} prospects
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {viewMode === 'kanban' && (
                                <button 
                                    onClick={() => setIsLocked(!isLocked)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all border",
                                        isLocked 
                                            ? "bg-slate-800 text-slate-400 border-slate-700 hover:text-white" 
                                            : "bg-amber-500/10 text-amber-500 border-amber-500/40 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                    )}
                                >
                                    {isLocked ? '🔒 INTERFACE VERROUILLÉE' : '🔓 ÉDITION ACTIVÉE'}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        {/* Ligne 1: Recherche + bouton filtres avancés */}
                        <div className="flex gap-3 items-center">
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Rechercher un contact..."
                                className="flex-1 px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                            />
                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border",
                                    showAdvanced ? "bg-blue-600/20 text-blue-400 border-blue-500/40" : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-white"
                                )}
                            >
                                🎛️ Filtres {(filterProgrammes.length + filterStatuts.length > 0 || filterScoreMin > 0 || filterScoreMax < 100) && <span className="bg-blue-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{filterProgrammes.length + filterStatuts.length + (filterScoreMin > 0 || filterScoreMax < 100 ? 1 : 0)}</span>}
                            </button>
                            {(filterProgrammes.length + filterStatuts.length > 0 || filterScoreMin > 0 || filterScoreMax < 100) && (
                                <button onClick={resetFilters} className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-red-400 transition-colors">✕ Reset</button>
                            )}
                        </div>

                        {/* Segments Sauvegardés */}
                        {segments.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                                <span className="text-xs text-slate-500 self-center">💾 Segments:</span>
                                {segments.map(seg => (
                                    <div key={seg.id} className="flex items-center gap-1">
                                        <button
                                            onClick={() => applySegment(seg)}
                                            className="px-3 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-full text-xs hover:bg-indigo-500/30 transition-colors"
                                        >
                                            {seg.name}
                                        </button>
                                        <button onClick={() => deleteSegment(seg.id)} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Panneau Filtres Avancés */}
                        {showAdvanced && (
                            <div className="glass-card p-4 space-y-4 animate-fadeIn">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Programmes */}
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">🎓 Programmes</p>
                                        <div className="flex flex-wrap gap-2">
                                            {PROGRAMMES.map(prog => (
                                                <button
                                                    key={prog}
                                                    onClick={() => toggleProgramme(prog)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                                                        filterProgrammes.includes(prog)
                                                            ? "bg-blue-500/30 text-blue-300 border-blue-500/50 shadow-sm"
                                                            : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-white hover:border-slate-500"
                                                    )}
                                                >
                                                    {prog}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Statuts */}
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">📊 Statuts</p>
                                        <div className="flex flex-wrap gap-2">
                                            {STATUTS.map(statut => (
                                                <button
                                                    key={statut}
                                                    onClick={() => toggleStatut(statut)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                                                        filterStatuts.includes(statut)
                                                            ? "bg-emerald-500/30 text-emerald-300 border-emerald-500/50 shadow-sm"
                                                            : "bg-slate-800/50 text-slate-400 border-slate-700/50 hover:text-white hover:border-slate-500"
                                                    )}
                                                >
                                                    {statut}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Plage de score */}
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">🎯 Score d&apos;engagement : <span className="text-white">{filterScoreMin} — {filterScoreMax}</span></p>
                                    <div className="flex gap-4 items-center">
                                        <div className="flex-1">
                                            <p className="text-[10px] text-slate-500 mb-1">Min</p>
                                            <input type="range" min={0} max={100} value={filterScoreMin}
                                                onChange={e => setFilterScoreMin(Math.min(Number(e.target.value), filterScoreMax - 1))}
                                                className="w-full accent-blue-500"
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[10px] text-slate-500 mb-1">Max</p>
                                            <input type="range" min={0} max={100} value={filterScoreMax}
                                                onChange={e => setFilterScoreMax(Math.max(Number(e.target.value), filterScoreMin + 1))}
                                                className="w-full accent-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Sauvegard du segment */}
                                <div className="flex items-center justify-between border-t border-slate-700/50 pt-3">
                                    <p className="text-xs text-slate-400">{filtered.length} résultats avec ces filtres</p>
                                    <div className="flex gap-2 items-center">
                                        {showSaveSegment ? (
                                            <>
                                                <input
                                                    value={segmentName}
                                                    onChange={e => setSegmentName(e.target.value)}
                                                    placeholder="Nom du segment..."
                                                    onKeyDown={e => e.key === 'Enter' && saveSegment()}
                                                    className="px-3 py-1.5 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                                                    autoFocus
                                                />
                                                <button onClick={saveSegment} disabled={savingSegment} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                                    {savingSegment ? '...' : '💾 Sauvegarder'}
                                                </button>
                                                <button onClick={() => setShowSaveSegment(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
                                            </>
                                        ) : (
                                            <button onClick={() => setShowSaveSegment(true)} className="px-3 py-1.5 bg-slate-700 text-slate-300 text-xs rounded-lg hover:bg-slate-600 transition-colors">
                                                💾 Enregistrer ce segment
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Contenu principal (Kanban, Table Prospects, ou Table Inscrits) */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="p-8 text-center text-slate-500">Chargement...</div>
                    ) : viewMode === 'kanban' ? (
                        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-4 h-full scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                            {KANBAN_COLUMNS.map(columnStatus => {
                                const columnProspects = filtered.filter(p => p.statut_conversation === columnStatus)
                                return (
                                    <div
                                        key={columnStatus}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, columnStatus)}
                                        className="w-[300px] flex-shrink-0 flex flex-col bg-slate-900/50 rounded-xl border border-slate-800/60"
                                    >
                                        <div className="p-3 border-b border-slate-800/60 flex items-center justify-between">
                                            <h3 className="font-bold text-sm text-slate-200">
                                                {columnStatus}
                                            </h3>
                                            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                                                {columnProspects.length}
                                            </span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-hide">
                                            {columnProspects.map(p => {
                                                const name = p.prenom ? `${p.prenom} ${p.nom ?? ''}`.trim() : p.chat_id
                                                return (
                                                    <div
                                                        key={p.id}
                                                        draggable={!isLocked}
                                                        onDragStart={(e) => handleDragStart(e, p.id)}
                                                        onClick={() => setSelected(p)}
                                                        className={cn(
                                                            "glass-card p-4 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition-all",
                                                            isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                                                            draggingId === p.id ? "opacity-40 border-dashed" : "opacity-100",
                                                            updatingId === p.id ? "animate-pulse" : ""
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-lg">
                                                                {getInitials(p.prenom ?? undefined, p.nom ?? undefined)}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="font-bold text-white text-sm truncate">{name}</p>
                                                                <p className="text-xs text-slate-400 truncate tracking-wide">{p.chat_id}</p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-2" title="Score d'engagement">
                                                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-1">
                                                                <div className="h-full rounded-full transition-all"
                                                                    style={{
                                                                        width: `${p.score_engagement}%`,
                                                                        background: p.score_engagement >= 80 ? '#34d399' : p.score_engagement >= 50 ? '#fbbf24' : '#64748b'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between items-center mt-1.5">
                                                                <span className="text-[10px] font-bold text-slate-400 px-1.5 py-0.5 bg-slate-800 rounded">
                                                                    {p.programme_recommande ?? '—'}
                                                                </span>
                                                                <div className="flex gap-1.5">
                                                                    {p.score_engagement >= 80 && <span title="Chaud" className="text-xs drop-shadow-md">🔥</span>}
                                                                    {p.niveau_urgence === 'Élevé' && <span title="Urgent" className="text-xs drop-shadow-md">🚨</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0" style={{ background: 'rgba(10, 15, 30, 0.95)', zIndex: 10 }}>
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
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // Le lien natif gérera la navigation
                                                            }}>
                                                            💬
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
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
