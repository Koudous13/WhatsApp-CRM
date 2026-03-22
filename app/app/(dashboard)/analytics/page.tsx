'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { 
    TrendingUp, Users, Target, AlertTriangle, ChevronRight, 
    Plus, Edit2, Trash2, Download, Zap, MessageSquare, 
    CheckCircle2, Clock, X, Search, Settings
} from 'lucide-react'

// --- Types ---
type Programme = { id: string; nom: string; description: string; cible: string }
type Inscription = { 
    id: string; prenom: string; nom: string; email: string; 
    telephone: string; programme_choisi: string; statut: string; created_at: string 
}

export default function AnalyticsCockpit() {
    const supabase = createClient()
    
    // --- States ---
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'global' | string>('global')
    const [searchQuery, setSearchQuery] = useState('')
    
    // Data
    const [programmes, setProgrammes] = useState<Programme[]>([])
    const [inscriptions, setInscriptions] = useState<Inscription[]>([])
    const [globalStats, setGlobalStats] = useState<any>(null)
    const [escalatedChats, setEscalatedChats] = useState<any[]>([])
    const [briefing, setBriefing] = useState<string>('Analyse des données en cours...')
    const [overrides, setOverrides] = useState<Record<string, number>>({})
    
    // Modals
    const [showProgModal, setShowProgModal] = useState(false)
    const [showInscrModal, setShowInscrModal] = useState(false)
    const [showOverrideModal, setShowOverrideModal] = useState(false)
    const [showEscalatedModal, setShowEscalatedModal] = useState(false)
    
    // Forms
    const [editProg, setEditProg] = useState<Programme | null>(null)
    const [editInscr, setEditInscr] = useState<Inscription | null>(null)
    const [progForm, setProgForm] = useState({ nom: '', description: '', cible: '' })
    const [inscrForm, setInscrForm] = useState({ prenom: '', nom: '', email: '', telephone: '', programme_choisi: '', statut: 'en_attente' })
    const [overrideForm, setOverrideForm] = useState({ metric_key: '', manual_value: 0 })

    // --- Data Fetching ---
    async function fetchData() {
        try {
            // 1. Fetch Météo IA (Fail-safe, non-bloquant)
            fetch('/api/analytics/briefing').then(res => res.json()).then(data => {
                if (data.briefing) setBriefing(data.briefing)
            }).catch(() => setBriefing("Bonjour Boss. Le système est en ligne !"))

            // 2. Fetch Overrides
            const resOv = await fetch('/api/analytics/override').then(r => r.json())
            const ovs: Record<string, number> = {}
            resOv.overrides?.forEach((o: any) => { if(o.manual_value !== null) ovs[o.metric_key] = o.manual_value })
            setOverrides(ovs)

            // 3. Programmes & Inscriptions
            const { data: progs } = await supabase.from('programmes').select('*').order('created_at')
            setProgrammes(progs || [])
            
            const { data: inscr } = await supabase.from('Inscriptions').select('*').order('created_at', { ascending: false })
            setInscriptions(inscr || [])
            
            // 4. Global Stats & Escalations
            const today = new Date().toISOString().split('T')[0]
            const [
                { count: totalContacts },
                { count: newToday },
                { data: escalatedData },
                { data: statutsData }
            ] = await Promise.all([
                supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true }),
                supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true }).gte('created_at', today),
                supabase.from('conversations').select('chat_id, updated_at', { count: 'exact' }).eq('status', 'escalated'),
                supabase.from('Profil_Prospects').select('statut_conversation')
            ])

            setEscalatedChats(escalatedData || [])

            const statC = statutsData?.reduce((acc: any, curr) => {
                acc[curr.statut_conversation || 'Nouveau'] = (acc[curr.statut_conversation || 'Nouveau'] || 0) + 1
                return acc
            }, {}) || {}
            
            setGlobalStats({
                total: totalContacts || 0,
                newToday: newToday || 0,
                escalations: escalatedData?.length || 0,
                funnel: {
                    nouveaux: (statC['Nouveau'] || 0) + (statC[''] || 0),
                    qualifies: (statC['Qualifié'] || 0) + (statC['Intéressé'] || 0),
                    propositions: statC['Proposition faite'] || 0,
                    inscrits: inscr?.length || 0
                }
            })
        } catch (error) {
            console.error("Erreur de chargement:", error)
        }
        setLoading(false)
    }

    useEffect(() => { fetchData() }, [])

    // --- Helpers Statistiques Modifiables ---
    const getStat = (key: string, realValue: number) => overrides[key] !== undefined ? overrides[key] : realValue

    async function saveOverride() {
        await fetch('/api/analytics/override', { method: 'POST', body: JSON.stringify(overrideForm) })
        setShowOverrideModal(false); fetchData()
    }

    // --- CSV Export ---
    function exportToCSV() {
        const rows = [
            ['Toutes les statistiques sont confidentielles - Export BloLab CRM'],
            [],
            ['METRIQUE', 'VALEUR'],
            ['Total Base CRM', getStat('total_contacts', globalStats?.total)],
            ['Attente Humaine', globalStats?.escalations],
            ['Inscriptions', getStat('total_inscrits', globalStats?.funnel.inscrits)],
            [],
            ['LISTE DES INSCRITS'],
            ['Date', 'Nom', 'Programme', 'Telephone', 'Email', 'Statut']
        ]

        inscriptions.forEach(i => {
            rows.push([new Date(i.created_at).toLocaleDateString(), `${i.prenom} ${i.nom || ''}`, i.programme_choisi, i.telephone, i.email, i.statut])
        })

        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(";")).join("\n")
        const encodedUri = encodeURI(csvContent)
        const link = document.createElement("a")
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", `Export_Cockpit_${new Date().toLocaleDateString()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    // --- CRUD Programmes ---
    async function saveProgramme() {
        if (!progForm.nom) return
        if (editProg) await fetch(`/api/programmes/${editProg.id}`, { method: 'PUT', body: JSON.stringify(progForm) })
        else await fetch('/api/programmes', { method: 'POST', body: JSON.stringify(progForm) })
        setShowProgModal(false); setEditProg(null); setProgForm({ nom: '', description: '', cible: '' }); fetchData()
    }

    async function deleteProgramme(id: string) {
        if (!confirm('Toutes les stats liées seront impactées. Confirmer ?')) return
        await fetch(`/api/programmes/${id}`, { method: 'DELETE' })
        if (activeTab === id) setActiveTab('global')
        fetchData()
    }

    // --- CRUD Inscriptions ---
    async function saveInscription() {
        if (!inscrForm.prenom || !inscrForm.programme_choisi) return
        if (editInscr) await fetch(`/api/inscription/${editInscr.id}`, { method: 'PUT', body: JSON.stringify(inscrForm) })
        else await fetch('/api/inscription', { method: 'POST', body: JSON.stringify({ ...inscrForm, chat_id: 'manual_' + Date.now() }) })
        
        setShowInscrModal(false); setEditInscr(null); 
        setInscrForm({ prenom: '', nom: '', email: '', telephone: '', programme_choisi: activeTab !== 'global' ? activeTab : '', statut: 'en_attente' })
        fetchData()
    }

    async function deleteInscription(id: string) {
        if (!confirm('Supprimer cette inscription ?')) return
        await fetch(`/api/inscription/${id}`, { method: 'DELETE' })
        fetchData()
    }

    // --- Rendu ---
    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[50vh]"><Zap size={40} className="animate-pulse text-blue-500 mb-4" />Initialisation du Cockpit...</div>

    const activeProg = programmes.find(p => p.id === activeTab)
    const filteredInscriptions = activeTab === 'global' ? inscriptions : inscriptions.filter(i => i.programme_choisi.toLowerCase().includes(activeProg?.nom.toLowerCase() || ''))
    const displayedInscriptions = filteredInscriptions.filter(i => (i.prenom + ' ' + (i.nom||'')).toLowerCase().includes(searchQuery.toLowerCase()) || (i.email||'').toLowerCase().includes(searchQuery.toLowerCase()) || (i.telephone||'').includes(searchQuery))

    // Valeurs Override
    const displayTotal = getStat('total_contacts', globalStats?.total)
    const displayInscrits = getStat('total_inscrits', inscriptions.length)

    return (
        <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto pb-32">
            
            {/* HEADER COCKPIT */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-[#1e293b]/40 p-8 rounded-[2rem] border border-slate-800/60 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                <div className="relative z-10 max-w-3xl">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest border border-blue-500/30 flex items-center gap-1"><Zap size={12}/> IA MÉTÉO</span>
                        <span className="text-slate-500 text-sm font-medium">Briefing Exécutif</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-relaxed italic border-l-4 border-blue-500 pl-4 py-2 mt-4">
                        "{briefing}"
                    </h1>
                </div>
                <div className="relative z-10 flex gap-3">
                    <button onClick={exportToCSV} className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg border border-slate-700 hover:border-slate-500">
                        <Download size={18} /> Export CSV
                    </button>
                </div>
            </div>

            {/* NAVIGATION TABS */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                    onClick={() => setActiveTab('global')}
                    className={cn("px-6 py-3 rounded-2xl font-black tracking-wide whitespace-nowrap transition-all", activeTab === 'global' ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-slate-800/50 text-slate-400 hover:bg-slate-800")}
                >
                    🌐 VUE GLOBALE
                </button>
                {programmes.map(p => (
                    <button 
                        key={p.id} onClick={() => setActiveTab(p.id)}
                        className={cn("px-6 py-3 rounded-2xl font-black tracking-wide whitespace-nowrap transition-all", activeTab === p.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" : "bg-slate-800/50 text-slate-400 hover:bg-slate-800")}
                    >
                        {p.nom.toUpperCase()}
                    </button>
                ))}
                <button 
                    onClick={() => { setProgForm({ nom: '', description: '', cible: '' }); setEditProg(null); setShowProgModal(true) }}
                    className="px-4 py-3 rounded-2xl font-black text-slate-500 border border-dashed border-slate-700 hover:bg-slate-800 hover:text-white transition-all whitespace-nowrap flex items-center gap-2"
                >
                    <Plus size={18} /> PROGRAMME
                </button>
            </div>

            {/* VUE CONTENU */}
            <AnimatePresence mode="wait">
                {activeTab === 'global' ? (
                    <motion.div key="global" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
                        
                        {/* KPIs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div className="bg-[#1e293b]/40 p-6 rounded-[2rem] border border-slate-800/60 hover:bg-[#1e293b]/60 transition-colors relative group">
                                <button onClick={() => { setOverrideForm({ metric_key: 'total_contacts', manual_value: displayTotal }); setShowOverrideModal(true) }} className="absolute top-4 right-4 text-slate-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={16}/></button>
                                <div className="w-12 h-12 bg-blue-500/10 text-blue-400 rounded-2xl flex items-center justify-center mb-4"><Users size={24} /></div>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-1">Base CRM Totale</p>
                                <p className="text-3xl font-black text-white">{displayTotal} {overrides['total_contacts'] !== undefined && <span className="text-[10px] text-blue-500 align-top">*édité</span>}</p>
                            </div>

                            <div onClick={() => setShowEscalatedModal(true)} className="bg-[#1e293b]/40 p-6 rounded-[2rem] border border-slate-800/60 hover:bg-rose-900/20 hover:border-rose-500/30 transition-colors cursor-pointer group relative">
                                <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><AlertTriangle size={24} /></div>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-1">Attente Humain (Drill-down)</p>
                                <p className="text-3xl font-black text-white">{globalStats?.escalations}</p>
                            </div>

                            <div className="bg-[#1e293b]/40 p-6 rounded-[2rem] border border-slate-800/60 hover:bg-[#1e293b]/60 transition-colors relative group">
                                <button onClick={() => { setOverrideForm({ metric_key: 'total_inscrits', manual_value: displayInscrits }); setShowOverrideModal(true) }} className="absolute top-4 right-4 text-slate-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={16}/></button>
                                <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mb-4"><CheckCircle2 size={24} /></div>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-1">Total Inscriptions</p>
                                <p className="text-3xl font-black text-white">{displayInscrits} {overrides['total_inscrits'] !== undefined && <span className="text-[10px] text-emerald-500 align-top">*édité</span>}</p>
                            </div>

                            <div className="bg-[#1e293b]/40 p-6 rounded-[2rem] border border-emerald-500/30 bg-gradient-to-br from-[#1e293b]/40 to-emerald-900/10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><Target size={100} /></div>
                                <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Objectif Mensuel</p>
                                <div className="flex items-end justify-between mb-2">
                                    <p className="text-4xl font-black text-emerald-400">{Math.round((displayInscrits / 200) * 100)}%</p>
                                    <p className="text-sm font-bold text-slate-500">{displayInscrits}/200</p>
                                </div>
                                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all" style={{ width: `${Math.min((displayInscrits / 200) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Funnel */}
                        <div className="bg-[#1e293b]/40 p-8 rounded-[2rem] border border-slate-800/60">
                            <h3 className="text-xl font-black text-white mb-8 flex items-center gap-2">
                                <TrendingUp className="text-blue-500" /> Pipeline de Conversion
                            </h3>
                            <div className="flex flex-col md:flex-row gap-4 h-[160px]">
                                {[
                                    { k: 'nouveaux', l: 'Nouveaux Contacts', c: 'bg-slate-700', t: 'text-slate-300' },
                                    { k: 'qualifies', l: 'Leads Qualifiés', c: 'bg-blue-600', t: 'text-blue-300' },
                                    { k: 'propositions', l: 'Propositions Faites', c: 'bg-purple-600', t: 'text-purple-300' },
                                    { k: 'inscrits', l: 'Inscrits / Payé', c: 'bg-emerald-500', t: 'text-emerald-200', ov: displayInscrits },
                                ].map((step) => {
                                    const val = step.ov !== undefined ? step.ov : (globalStats?.funnel[step.k] || 0)
                                    const max = Math.max(displayTotal, globalStats?.funnel['nouveaux'] || 1)
                                    const pct = Math.max((val / max) * 100, 15)
                                    return (
                                        <div key={step.k} className="flex-1 flex flex-col items-center group cursor-pointer h-full">
                                            <div className="w-full flex-grow flex items-end justify-center bg-slate-800/30 rounded-2xl overflow-hidden border border-slate-700/50 group-hover:border-slate-500 transition-colors relative">
                                                <div className={`w-full transition-all duration-1000 ${step.c} flex items-center justify-center`} style={{ height: `${pct}%` }}>
                                                    <span className="font-black text-white text-2xl drop-shadow-md">{val}</span>
                                                </div>
                                            </div>
                                            <p className={`mt-3 text-xs md:text-sm font-black uppercase tracking-wider text-center ${step.t}`}>{step.l}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    /* HUBS PROGRAMMES */
                    <motion.div key="programme" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-900/10 p-6 flex-wrap rounded-3xl border border-emerald-500/20">
                            <div>
                                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                                    Hub : {activeProg?.nom}
                                    <button onClick={() => { setProgForm(activeProg!); setEditProg(activeProg!); setShowProgModal(true) }} className="text-slate-500 hover:text-white transition-colors p-1"><Edit2 size={16} /></button>
                                </h2>
                                <p className="text-slate-400 mt-1">{activeProg?.description}</p>
                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mt-2">Cible : {activeProg?.cible}</p>
                            </div>
                            <div className="flex gap-4 items-center w-full md:w-auto">
                                <div className="bg-slate-900/50 px-6 py-3 rounded-2xl border border-slate-700 text-center relative group">
                                    <button onClick={() => { setOverrideForm({ metric_key: 'prog_' + activeProg?.id, manual_value: getStat('prog_' + activeProg?.id, filteredInscriptions.length) }); setShowOverrideModal(true) }} className="absolute -top-2 -right-2 text-slate-500 bg-slate-800 rounded-full p-1 border border-slate-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"><Settings size={12}/></button>
                                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Inscrits</p>
                                    <p className="text-2xl font-black text-white">{getStat('prog_' + activeProg?.id, filteredInscriptions.length)}</p>
                                </div>
                                <button onClick={() => deleteProgramme(activeProg!.id)} className="p-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl transition-all"><Trash2 size={20} /></button>
                            </div>
                        </div>

                        {/* GRID INSCRIPTIONS */}
                        <div className="bg-[#1e293b]/40 rounded-[2rem] border border-slate-800/60 overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between gap-4">
                                <h3 className="font-black text-white text-lg flex items-center gap-2"><Users className="text-emerald-500" /> Base d'inscrits</h3>
                                <div className="flex gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                        <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="bg-slate-900/50 border border-slate-700 text-sm text-white rounded-xl pl-10 pr-4 py-2 w-full sm:w-64 focus:border-blue-500 outline-none" />
                                    </div>
                                    <button onClick={() => { setInscrForm({ prenom: '', nom: '', email: '', telephone: '', programme_choisi: activeProg?.nom || '', statut: 'valide' }); setEditInscr(null); setShowInscrModal(true) }} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2 transition-all whitespace-nowrap"><Plus size={16} /> Ajouter</button>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm text-slate-300">
                                    <thead className="text-[10px] uppercase font-black tracking-wider text-slate-500 bg-slate-900/50">
                                        <tr><th className="px-6 py-4">Nom Complet</th><th className="px-6 py-4">Contact</th><th className="px-6 py-4">Statut</th><th className="px-6 py-4 text-right">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {displayedInscriptions.length === 0 && <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-500 italic">Aucune inscription trouvée.</td></tr>}
                                        {displayedInscriptions.map(i => (
                                            <tr key={i.id} className="hover:bg-slate-800/20 transition-colors group">
                                                <td className="px-6 py-4 font-bold text-white flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center uppercase">{i.prenom.charAt(0)}</div>{i.prenom} {i.nom}</td>
                                                <td className="px-6 py-4 font-mono text-xs">{i.telephone || i.email || 'N/A'}</td>
                                                <td className="px-6 py-4"><span className={cn("px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider", i.statut==='valide'||i.statut==='inscrit'?'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20':'bg-amber-500/10 text-amber-400 border border-amber-500/20')}>{i.statut}</span></td>
                                                <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setInscrForm(i as any); setEditInscr(i); setShowInscrModal(true) }} className="text-blue-400 hover:text-blue-300 p-2"><Edit2 size={16}/></button>
                                                    <button onClick={() => deleteInscription(i.id)} className="text-rose-400 hover:text-rose-300 p-2"><Trash2 size={16}/></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- MODALS --- */}
            <AnimatePresence>
                {/* Modal Overrides */}
                {showOverrideModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 border border-slate-700 p-8 rounded-[2rem] w-full max-w-sm shadow-2xl">
                            <h2 className="text-xl font-black text-white mb-2">Ajustement Manuel</h2>
                            <p className="text-slate-400 text-sm mb-6">Forcez une valeur numérique si les données automatiques sont incomplètes.</p>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 block">Nouvelle Valeur</label>
                                <input type="number" min="0" value={overrideForm.manual_value} onChange={e => setOverrideForm({...overrideForm, manual_value: parseInt(e.target.value) || 0})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl focus:border-blue-500 outline-none font-black text-xl text-center" />
                            </div>
                            <div className="flex flex-col gap-3 mt-8">
                                <button onClick={saveOverride} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold shadow-lg transition-all">Appliquer la modification</button>
                                <button onClick={() => { setOverrideForm({...overrideForm, manual_value: null as any}); saveOverride() }} className="w-full text-rose-500 text-sm font-bold mt-2">Réinitialiser (Auto)</button>
                                <button onClick={() => setShowOverrideModal(false)} className="w-full text-slate-400 font-bold hover:text-white transition-colors">Fermer</button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modal Escalated Chats (Drill-down) */}
                {showEscalatedModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 border border-rose-500/50 p-6 rounded-[2rem] w-full max-w-xl shadow-2xl max-h-[80vh] flex flex-col">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-black text-white flex items-center gap-2"><AlertTriangle className="text-rose-500"/> Interventions Requises</h2>
                                <button onClick={() => setShowEscalatedModal(false)} className="text-slate-500 hover:text-white"><X/></button>
                            </div>
                            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                                {escalatedChats.length === 0 ? <p className="text-emerald-400 font-bold p-4 bg-emerald-500/10 rounded-xl text-center">Aucune intervention humaine requise ✅</p> : null}
                                {escalatedChats.map(c => (
                                    <div key={c.chat_id} className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700 hover:bg-slate-800 transition-colors">
                                        <div>
                                            <p className="font-bold text-white text-sm">{c.chat_id.replace('@c.us', '')}</p>
                                            <p className="text-xs text-rose-400 flex items-center gap-1 mt-1"><Clock size={10}/> Dernier message: {new Date(c.updated_at).toLocaleTimeString()}</p>
                                        </div>
                                        <a href={`/inbox?chat_id=${c.chat_id}`} className="bg-slate-700 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all">Consulter</a>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Modals Prog & Inscr existants... */}
                {showProgModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 border border-slate-700 p-8 rounded-[2rem] w-full max-w-lg shadow-2xl">
                            <h2 className="text-2xl font-black text-white mb-6">{editProg ? 'Modifier Programme' : 'Nouveau Programme'}</h2>
                            <div className="space-y-4">
                                <div><label className="text-xs font-bold text-slate-400 uppercase block">Nom *</label><input type="text" value={progForm.nom} onChange={e => setProgForm({...progForm, nom: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl outline-none" placeholder="Ex: MasterClass" /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase block">Description</label><textarea value={progForm.description} onChange={e => setProgForm({...progForm, description: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl outline-none min-h-[100px]" /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase block">Cible</label><input type="text" value={progForm.cible} onChange={e => setProgForm({...progForm, cible: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl outline-none" /></div>
                            </div>
                            <div className="flex justify-end gap-3 mt-8"><button onClick={() => setShowProgModal(false)} className="px-6 py-3 font-bold text-slate-400">Annuler</button><button onClick={saveProgramme} disabled={!progForm.nom} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-bold">Enregistrer</button></div>
                        </motion.div>
                    </div>
                )}

                {showInscrModal && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-slate-900 border border-slate-700 p-8 rounded-[2rem] w-full max-w-xl shadow-2xl">
                            <h2 className="text-2xl font-black text-white mb-6">{editInscr ? 'Modifier' : 'Nouvelle Inscription'}</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-slate-400 block mb-1">Prénom *</label><input type="text" value={inscrForm.prenom} onChange={e => setInscrForm({...inscrForm, prenom: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl" /></div>
                                <div><label className="text-xs font-bold text-slate-400 block mb-1">Nom</label><input type="text" value={inscrForm.nom} onChange={e => setInscrForm({...inscrForm, nom: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl" /></div>
                                <div><label className="text-xs font-bold text-slate-400 block mb-1">Téléphone</label><input type="text" value={inscrForm.telephone} onChange={e => setInscrForm({...inscrForm, telephone: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl" /></div>
                                <div className="col-span-2 sm:col-span-1"><label className="text-xs font-bold text-slate-400 block mb-1">Programme *</label>
                                    <select value={inscrForm.programme_choisi} onChange={e => setInscrForm({...inscrForm, programme_choisi: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl">
                                        <option value="">Sélectionner...</option>{programmes.map(p => <option key={p.id} value={p.nom}>{p.nom}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-2 sm:col-span-1"><label className="text-xs font-bold text-slate-400 block mb-1">Statut</label>
                                    <select value={inscrForm.statut} onChange={e => setInscrForm({...inscrForm, statut: e.target.value})} className="w-full bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-xl">
                                        <option value="en_attente">En attente</option><option value="valide">Validé</option><option value="annule">Annulé</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-8"><button onClick={() => setShowInscrModal(false)} className="px-6 py-3 font-bold text-slate-400">Annuler</button><button onClick={saveInscription} disabled={!inscrForm.prenom || !inscrForm.programme_choisi} className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold">Sauvegarder</button></div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
