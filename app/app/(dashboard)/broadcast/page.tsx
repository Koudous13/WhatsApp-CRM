'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeDate, cn } from '@/lib/utils'
import Papa from 'papaparse'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, Users, MessageSquare, Calendar, ChevronRight, ChevronLeft, 
  Plus, Trash2, Globe, FileText, CheckCircle2, AlertCircle, 
  Loader2, Smartphone, Target, Zap, Clock, Info, Sparkles
} from 'lucide-react'

type Variant = {
    id: string
    body: string
    ratio: number
}

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

type SmartSegment = {
    id: string
    name: string
    filters: { programmes: string[]; statuts: string[]; scoreMin: number; scoreMax: number }
}

const PROGRAMMES = [
  { id: 'ClassTech', label: 'ClassTech', icon: '🤖' },
  { id: 'Ecole229', label: 'École 229', icon: '🎓' },
  { id: 'KMC', label: 'KMC', icon: '🔧' },
  { id: 'Incubateur', label: 'Incubateur', icon: '🚀' },
  { id: 'FabLab', label: 'FabLab', icon: '🛠️' },
]

const DB_TAGS = [
  { key: 'Prenom', label: 'Prénom', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { key: 'Nom', label: 'Nom', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  { key: 'Programme', label: 'Programme', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { key: 'Ville', label: 'Ville', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
]

export default function BroadcastPage() {
    const supabase = createClient()
    const [step, setStep] = useState(1) // 1: Audience, 2: Message, 3: Schedule
    const [showCreate, setShowCreate] = useState(false)
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    
    // Form State
    const [name, setName] = useState('')
    const [filterProgramme, setFilterProgramme] = useState<string[]>([])
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
    const [csvData, setCsvData] = useState<any[]>([])
    const [csvHeaders, setCsvHeaders] = useState<string[]>([])
    const [variants, setVariants] = useState<Variant[]>([{ id: '1', body: '', ratio: 100 }])
    const [activeVariantId, setActiveVariantId] = useState('1')
    const [scheduledAt, setScheduledAt] = useState<string>('')
    
    // UI State
    const [estimating, setEstimating] = useState(false)
    const [estimate, setEstimate] = useState<number | null>(null)
    const [sending, setSending] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')
    const [savedSegments, setSavedSegments] = useState<SmartSegment[]>([])
    
    const fileInputRef = useRef<HTMLInputElement>(null)
    const activeVariant = variants.find(v => v.id === activeVariantId) || variants[0]

    useEffect(() => { 
      loadCampaigns()
      loadSavedSegments()
      // Charger le brouillon
      const draft = localStorage.getItem('broadcast_draft')
      if (draft) {
        const parsed = JSON.parse(draft)
        setName(parsed.name || '')
        setVariants(parsed.variants || [{ id: '1', body: '', ratio: 100 }])
      }
    }, [])

    // Audience Estimation Effect
    useEffect(() => {
      const timer = setTimeout(() => {
        if (showCreate && step === 1) estimateAudience()
      }, 800)
      return () => clearTimeout(timer)
    }, [filterProgramme, selectedSegmentId, csvData, showCreate, step])

    // Auto-save draft
    useEffect(() => {
      if (showCreate) {
        localStorage.setItem('broadcast_draft', JSON.stringify({ name, variants }))
      }
    }, [name, variants, showCreate])

    async function loadCampaigns() {
        const { data } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false }).limit(20)
        setCampaigns((data as any) ?? [])
    }

    async function loadSavedSegments() {
        const { data } = await supabase.from('Smart_Segments').select('*').order('created_at', { ascending: false })
        setSavedSegments((data as any) ?? [])
    }

    async function estimateAudience() {
        if (csvData.length > 0) {
          setEstimate(csvData.length)
          return
        }
        setEstimating(true)
        let query = supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true }).eq('opt_in', true)
        
        const seg = selectedSegmentId ? savedSegments.find(s => s.id === selectedSegmentId) : null
        if (seg) {
            if (seg.filters.programmes.length > 0) query = query.in('programme_recommande', seg.filters.programmes)
            if (seg.filters.statuts.length > 0) query = query.in('statut_conversation', seg.filters.statuts)
            query = query.gte('score_engagement', seg.filters.scoreMin).lte('score_engagement', seg.filters.scoreMax)
        } else if (filterProgramme.length > 0) {
            query = query.in('programme_recommande', filterProgramme)
        }
        
        const { count } = await query
        setEstimate(count ?? 0)
        setEstimating(false)
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsedData = results.data as Record<string, unknown>[]
                setCsvData(parsedData)
                if (parsedData.length > 0) setCsvHeaders(Object.keys(parsedData[0]))
                setEstimate(parsedData.length)
            }
        })
    }

    async function deleteCampaign(id: string) {
      if (!confirm("Voulez-vous vraiment supprimer cet historique de diffusion ?")) return
      try {
        const res = await fetch('/api/broadcast/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        })
        if (res.ok) loadCampaigns()
      } catch (err) { console.error(err) }
    }

    function resetForm() {
      setName(''); setStep(1); setVariants([{ id: '1', body: '', ratio: 100 }]); 
      setCsvData([]); setFilterProgramme([]); setEstimate(null); setScheduledAt('')
      setErrorMsg(''); setEditingId(null)
    }

    const [editingId, setEditingId] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    function handleEdit(c: Campaign) {
      setName(c.name)
      setVariants([{ id: '1', body: c.body, ratio: 100 }])
      setScheduledAt(c.scheduled_at?.slice(0, 16) || '')
      setEditingId(c.id)
      setStep(1)
      setShowCreate(true)
    }

    const nextStep = () => {
      if (step === 1 && !name.trim()) { setErrorMsg("Donnez un nom à votre campagne"); return }
      if (step === 2 && !activeVariant.body.trim()) { setErrorMsg("Le message ne peut pas être vide"); return }
      setErrorMsg("")
      setStep(prev => prev + 1)
    }

    const prevStep = () => setStep(prev => prev - 1)

    async function handleLaunch() {
      setSending(true)
      setErrorMsg("")
      try {
        const selectedSegment = selectedSegmentId ? savedSegments.find(s => s.id === selectedSegmentId) : null
        
        const res = await fetch('/api/broadcast/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                variants, 
                filterProgramme, 
                filterOptIn: true, // Toujours forcer l'opt-in par sécurité
                csvData: csvData.length > 0 ? csvData : null,
                scheduledAt: scheduledAt || null,
                selectedSegmentId: selectedSegmentId || null,
                segmentFilters: selectedSegment ? selectedSegment.filters : null
            }),
        })
        const data = await res.json()
        if (data.ok) {
            setShowCreate(false)
            resetForm()
            localStorage.removeItem('broadcast_draft')
            loadCampaigns()
        } else setErrorMsg(data.error)
      } catch (err: any) { setErrorMsg(err.message) }
      finally { setSending(false) }
    }

    function resetForm() {
      setName(''); setStep(1); setVariants([{ id: '1', body: '', ratio: 100 }]); 
      setCsvData([]); setFilterProgramme([]); setEstimate(null); setScheduledAt('')
    }

    return (
        <div className="h-full flex flex-col p-1 sm:p-4 lg:p-8 max-w-[1600px] mx-auto space-y-8 overflow-hidden">
            
            {/* Header */}
            <header className="flex items-center justify-between shrink-0">
                <div>
                  <h1 className="text-3xl font-black text-white flex items-center gap-3">
                    Broad<span className="text-blue-500">cast</span>
                    <span className="bg-blue-500/10 text-blue-400 text-[10px] px-2 py-1 rounded-full border border-blue-500/20 uppercase tracking-widest font-bold">V2.0</span>
                  </h1>
                  <p className="text-slate-400 text-sm font-medium mt-1">Multipliez votre impact avec des campagnes ciblées.</p>
                </div>
                <button 
                  onClick={() => setShowCreate(!showCreate)} 
                  className={cn(
                    "px-6 py-3 rounded-2xl font-black text-sm transition-all flex items-center gap-2",
                    showCreate ? "bg-slate-800 text-slate-400 hover:text-white" : "bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/20"
                  )}
                >
                  {showCreate ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={3} />}
                  {showCreate ? 'ANNULER' : 'LANCER UNE CAMPAGNE'}
                </button>
            </header>

            <main className="flex-1 min-h-0 relative">
              <AnimatePresence mode="wait">
                {showCreate ? (
                  <motion.div 
                    key="create" 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                    className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full pb-8"
                  >
                    {/* Left Side: Form Wizard */}
                    <div className="lg:col-span-12 xl:col-span-8 flex flex-col bg-[#1e293b]/20 border border-slate-800/60 rounded-[2.5rem] overflow-hidden backdrop-blur-xl">
                      
                      {/* Step Indicator */}
                      <div className="grid grid-cols-3 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
                        {[
                          { s: 1, label: 'Audience', icon: Users },
                          { s: 2, label: 'Message', icon: MessageSquare },
                          { s: 3, label: 'Envoi', icon: Send }
                        ].map(({ s, label, icon: Icon }) => (
                          <div key={s} className={cn(
                            "py-6 flex flex-col items-center gap-2 relative transition-all",
                            step === s ? "text-blue-400" : step > s ? "text-emerald-400" : "text-slate-600"
                          )}>
                            <Icon size={20} strokeWidth={step === s ? 3 : 2} />
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
                            {step === s && <motion.div layoutId="activeStep" className="absolute bottom-0 h-1 w-1/2 bg-blue-500 rounded-full" />}
                          </div>
                        ))}
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <AnimatePresence mode="wait">
                          {step === 1 && (
                            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 max-w-2xl mx-auto">
                              <section className="space-y-4">
                                <h2 className="text-xl font-black text-white flex items-center gap-2">
                                  <Target size={24} className="text-blue-500" />
                                  Identité de la campagne
                                </h2>
                                <input 
                                  value={name} onChange={e => setName(e.target.value)}
                                  placeholder="Ex: Relance École 229 - Février"
                                  className="w-full bg-[#0a0f1e]/60 border border-slate-800 focus:border-blue-500/50 rounded-2xl py-4 px-6 text-white text-lg font-bold outline-none transition-all placeholder-slate-700"
                                />
                              </section>

                              <section className="space-y-4">
                                <h2 className="text-xl font-black text-white flex items-center gap-2">
                                  <Users size={24} className="text-blue-500" />
                                  Ciblage de l'audience
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Smart Segments UI */}
                                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl space-y-4">
                                    <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest flex items-center gap-2">
                                      <Zap size={14} className="text-amber-500" /> Smart Segments
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                      <button 
                                        onClick={() => setSelectedSegmentId(null)}
                                        className={cn("px-4 py-2 rounded-xl text-xs font-bold transition-all border", !selectedSegmentId ? "bg-blue-600 text-white border-blue-600" : "bg-slate-800 text-slate-400 border-slate-700")}
                                      >🚀 Tous les contacts</button>
                                      {savedSegments.map(s => (
                                        <button 
                                          key={s.id} onClick={() => setSelectedSegmentId(s.id)}
                                          className={cn("px-4 py-2 rounded-xl text-xs font-bold transition-all border", selectedSegmentId === s.id ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-800 text-slate-400 border-slate-700")}
                                        >{s.name}</button>
                                      ))}
                                    </div>
                                  </div>

                                  {/* CSV UI */}
                                  <div className={cn(
                                    "p-6 border rounded-3xl transition-all cursor-pointer group flex flex-col justify-center items-center gap-3",
                                    csvData.length > 0 ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
                                  )} onClick={() => fileInputRef.current?.click()}>
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                                    <div className={cn("p-3 rounded-2xl transition-all", csvData.length > 0 ? "bg-emerald-500 text-white" : "bg-slate-800")}>
                                      {csvData.length > 0 ? <CheckCircle2 size={24} /> : <Plus size={24} />}
                                    </div>
                                    <div className="text-center">
                                      <p className="text-sm font-black whitespace-nowrap">{csvData.length > 0 ? 'LISTE CSV CHARGÉE' : 'IMPORTER UN CSV'}</p>
                                      <p className="text-[10px] opacity-60 uppercase font-black">{csvData.length > 0 ? `${csvData.length} LIGNES` : 'OPTIONNEL'}</p>
                                    </div>
                                  </div>
                                </div>

                                {!selectedSegmentId && csvData.length === 0 && (
                                  <div className="p-6 bg-slate-900/40 border border-slate-800 rounded-3xl space-y-4">
                                    <h3 className="text-xs font-black uppercase text-slate-500 tracking-widest">Filtrer par programmes</h3>
                                    <div className="flex flex-wrap gap-3">
                                      {PROGRAMMES.map(p => (
                                        <button 
                                          key={p.id}
                                          onClick={() => setFilterProgramme(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                                          className={cn(
                                            "flex items-center gap-3 px-5 py-3 rounded-2xl border font-bold text-sm transition-all",
                                            filterProgramme.includes(p.id) ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/20 scale-105" : "bg-slate-800 border-slate-800 text-slate-400 opacity-60 hover:opacity-100"
                                          )}
                                        >
                                          <span className="text-lg">{p.icon}</span>
                                          {p.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </section>

                              {/* Audience Indicator Badge */}
                              <div className="p-6 bg-gradient-to-r from-blue-600/20 via-blue-600/10 to-transparent border border-blue-500/20 rounded-3xl flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-600/30">
                                    <Users size={24} />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Audience Estimée</p>
                                    <p className={cn("text-2xl font-black text-white", estimating ? "animate-pulse" : "")}>
                                      {estimating ? 'Analyse...' : estimate === null ? '0' : `~ ${estimate.toLocaleString()}`} <span className="text-sm font-medium text-slate-500">destinataires</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="hidden sm:block text-right text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                                  Basé sur vos filtres<br/> et l'opt-in WhatsApp
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {step === 2 && (
                            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 h-full flex flex-col">
                              
                              {/* Header Step 2 with Auto-save indicator */}
                              <div className="flex items-center justify-between shrink-0">
                                <div>
                                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                                    <MessageSquare size={24} className="text-blue-500" />
                                    Rédaction des messages
                                  </h2>
                                  <p className="text-xs text-slate-500 font-medium">Créez des variantes pour tester l'engagement (A/B Testing)</p>
                                </div>
                                <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                  <span className="text-[9px] font-black text-emerald-500 tracking-widest uppercase">Brouillon Enregistré</span>
                                </div>
                              </div>

                              {/* A/B Testing Cards / Tabs */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
                                {variants.map(v => (
                                  <button 
                                    key={v.id} 
                                    onClick={() => setActiveVariantId(v.id)}
                                    className={cn(
                                      "p-4 rounded-[1.5rem] border text-left transition-all relative overflow-hidden group",
                                      activeVariantId === v.id 
                                        ? "bg-blue-600 border-blue-400 text-white shadow-xl shadow-blue-600/20 active:scale-95" 
                                        : "bg-slate-900/60 border-slate-800 text-slate-500 hover:border-slate-700 hover:bg-slate-900"
                                    )}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Version {v.id}</span>
                                      <Smartphone size={10} className={activeVariantId === v.id ? "text-blue-200" : "text-slate-700"} />
                                    </div>
                                    <p className="text-[10px] font-bold line-clamp-1 italic px-1">
                                      {v.body.trim() ? v.body : "(Vide)"}
                                    </p>
                                    {activeVariantId === v.id && (
                                      <motion.div layoutId="activeTag" className="absolute bottom-0 left-0 right-0 h-1 bg-white/40" />
                                    )}
                                  </button>
                                ))}
                                {variants.length < 5 && (
                                  <button 
                                    onClick={() => {
                                      const nextId = (variants.length + 1).toString();
                                      setVariants([...variants, { id: nextId, body: '', ratio: 10 }]);
                                      setActiveVariantId(nextId);
                                    }}
                                    className="p-4 rounded-[1.5rem] border border-dashed border-slate-800 text-slate-600 hover:text-blue-400 hover:border-blue-500/40 flex flex-col items-center justify-center gap-1 transition-all"
                                  >
                                    <Plus size={16} />
                                    <span className="text-[9px] font-black uppercase">Variante</span>
                                  </button>
                                )}
                              </div>

                              {/* Composer Area Container */}
                              <div className="flex-1 flex flex-col min-h-[400px] bg-[#0f172a]/40 border border-slate-800/80 rounded-[2rem] overflow-hidden shadow-inner">
                                
                                {/* NEW: Tagging Toolbar 2.0 */}
                                <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center gap-2">
                                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mr-2 flex items-center gap-1">
                                    <Zap size={10} /> Insérer :
                                  </span>
                                  {DB_TAGS.map(t => (
                                    <button 
                                      key={t.key} 
                                      onClick={() => insertTag(t.key)}
                                      className={cn(
                                        "px-2.5 py-1.5 rounded-xl text-[10px] font-black border transition-all hover:-translate-y-0.5 active:translate-y-0",
                                        t.color
                                      )}
                                    >
                                      {t.label}
                                    </button>
                                  ))}
                                  {csvHeaders.length > 0 && <div className="h-4 w-px bg-slate-800 mx-1" />}
                                  {csvHeaders.slice(0, 5).filter(h => !DB_TAGS.some(t => t.key === h)).map(h => (
                                    <button 
                                      key={h} 
                                      onClick={() => insertTag(h)}
                                      className="px-2.5 py-1.5 rounded-xl text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:-translate-y-0.5 transition-all"
                                    >
                                      CSV {h}
                                    </button>
                                  ))}
                                </div>

                                <textarea 
                                  value={activeVariant.body}
                                  onChange={e => setVariants(prev => prev.map(v => v.id === activeVariantId ? { ...v, body: e.target.value } : v))}
                                  className="flex-1 w-full bg-transparent p-8 py-6 text-white text-base font-medium outline-none transition-all placeholder-slate-800 resize-none leading-relaxed custom-scrollbar"
                                  placeholder={`Bonjour {Prenom} ! 👋 Bienvenue chez BloLab...`}
                                />

                                {/* Composer Footer */}
                                <div className="p-4 bg-slate-900/30 border-t border-slate-800/40 flex justify-between items-center px-8">
                                  <div className="flex items-center gap-4">
                                     {variants.length > 1 && (
                                       <div className="flex items-center gap-3">
                                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Ratio Audience</span>
                                          <input 
                                            type="number" 
                                            value={activeVariant.ratio} 
                                            onChange={e => setVariants(prev => prev.map(v => v.id === activeVariantId ? { ...v, ratio: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) } : v))}
                                            className="w-14 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-black text-blue-400 outline-none focus:border-blue-500"
                                          />
                                          <span className="text-[10px] font-bold text-slate-600">%</span>
                                       </div>
                                     )}
                                  </div>
                                  <div className={cn(
                                    "flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black transition-all",
                                    activeVariant.body.length > 1000 ? "bg-rose-500/10 text-rose-500" : "bg-slate-800 text-slate-500"
                                  )}>
                                    <Smartphone size={12} />
                                    {activeVariant.body.length} / 1024
                                  </div>
                                </div>
                              </div>

                              {variants.length > 1 && (
                                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Info size={14} className="text-blue-400" />
                                    <p className="text-[10px] text-blue-300 font-medium italic">
                                      Total des ratios : {variants.reduce((a, b) => a + b.ratio, 0)}% (doit être 100% pour continuer)
                                    </p>
                                  </div>
                                  {variants.reduce((a, b) => a + b.ratio, 0) !== 100 && (
                                     <button 
                                      onClick={() => {
                                        const remaining = 100 - variants.reduce((a, b) => a + (v.id === activeVariantId ? 0 : v.ratio) , 0); // Logic will need to be better but simpler for now:
                                        // Auto-balance simple:
                                        const otherSum = variants.filter(v => v.id !== activeVariantId).reduce((a,b) => a+b.ratio, 0);
                                        setVariants(prev => prev.map(v => v.id === activeVariantId ? { ...v, ratio: Math.max(0, 100 - otherSum) } : v));
                                      }}
                                      className="text-[10px] font-black text-blue-500 hover:underline"
                                     >AJUSTER AUTO</button>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          )}

                          {step === 3 && (
                            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-10 max-w-xl mx-auto py-10">
                              <section className="text-center space-y-2">
                                <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
                                  <Send size={40} />
                                </div>
                                <h2 className="text-3xl font-black text-white italic underline decoration-blue-500 underline-offset-8">Prêt pour le décollage ?</h2>
                                <p className="text-slate-500 font-medium">Révision finale avant l'envoi vers WhatsApp</p>
                              </section>

                              <div className="grid grid-cols-1 gap-4">
                                <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                    <Users className="text-blue-500" />
                                    <div>
                                      <p className="text-[10px] uppercase font-black text-slate-500">Audience</p>
                                      <p className="text-sm font-bold text-white">{estimate} destinataires</p>
                                    </div>
                                  </div>
                                  <button onClick={() => setStep(1)} className="text-[10px] font-black text-blue-500 hover:text-blue-400">MODIFIER</button>
                                </div>

                                <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
                                  <h3 className="text-[10px] font-black uppercase text-amber-500 flex items-center gap-2">
                                    <Clock size={14} /> Planification temporelle
                                  </h3>
                                  <input 
                                    type="datetime-local" 
                                    value={scheduledAt}
                                    onChange={e => setScheduledAt(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white font-bold outline-none focus:border-amber-500/50 transition-all shadow-inner"
                                  />
                                  <p className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
                                    <Info size={12} /> Laissez vide pour un envoi immédiat.
                                  </p>
                                </div>
                              </div>

                              {errorMsg && (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-500 text-xs font-bold text-center">
                                  {errorMsg}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Footer Actions */}
                      <div className="p-6 border-t border-slate-800/60 bg-slate-950/40 flex items-center justify-between shrink-0">
                        <button 
                          disabled={step === 1}
                          onClick={prevStep}
                          className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs text-slate-500 hover:text-white disabled:opacity-0 transition-all"
                        >
                          <ChevronLeft size={18} /> RETOUR
                        </button>

                        <div className="flex gap-4">
                          {step < 3 ? (
                            <button 
                              onClick={nextStep}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
                            >
                              CONTINUER <ChevronRight size={18} />
                            </button>
                          ) : (
                            <button 
                              onClick={handleLaunch}
                              disabled={sending}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black text-xs flex items-center gap-3 shadow-xl shadow-emerald-600/20 active:scale-95 transition-all"
                            >
                              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                              {scheduledAt ? 'PLANIFIER' : 'DIFFUSER MAINTENANT'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Smartphone Preview (Fixed on larger screens) */}
                    <div className="hidden xl:flex xl:col-span-4 justify-center items-start pt-10 sticky top-10 h-fit">
                      <div className="relative w-[340px] h-[680px] bg-black rounded-[3rem] border-[10px] border-slate-900 shadow-[0_0_100px_rgba(59,130,246,0.15)] overflow-hidden p-3 flex flex-col">
                        
                        {/* Speaker/Camera Notch */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-50"></div>
                        
                        {/* Screen Content (WhatsApp Clone) */}
                        <div className="flex-1 bg-[#efeae2] rounded-[2rem] overflow-hidden flex flex-col relative"
                             style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)', backgroundSize: '12px 12px' }}>
                          
                          {/* WhatsApp Header */}
                          <div className="bg-[#075e54] text-white p-4 pt-6 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xl shadow-inner border border-white/20">
                              🤖
                            </div>
                            <div>
                                <h4 className="font-bold text-sm">Prospect BloLab</h4>
                                <p className="text-[10px] text-emerald-100 opacity-80">en ligne</p>
                            </div>
                          </div>

                          {/* Chat Bubbles */}
                          <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                            <div className="self-center bg-white/70 backdrop-blur-sm text-[#111] text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-tighter mb-4">Aujourd'hui</div>
                            
                            <motion.div 
                              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                              className="bg-white text-[#111] p-3 rounded-2xl rounded-tl-sm shadow-[0_2px_5px_rgba(0,0,0,0.05)] max-w-[85%] text-[13px] leading-relaxed relative self-start"
                            >
                              Bonjour ! Comment se passent vos inscriptions ?
                              <div className="text-[9px] text-slate-400 text-right mt-1 font-bold italic">09:41</div>
                            </motion.div>

                            <AnimatePresence>
                              {activeVariant.body.trim() && (
                                <motion.div 
                                  initial={{ scale: 0.9, opacity: 0, x: 20 }} animate={{ scale: 1, opacity: 1, x: 0 }}
                                  className="bg-[#dcf8c6] text-[#111] p-3 rounded-2xl rounded-tr-sm shadow-[0_2px_5px_rgba(0,0,0,0.1)] max-w-[85%] text-[13px] leading-relaxed relative self-end group"
                                >
                                  <div className="absolute -top-3 -right-2 bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-blue-400 z-10">VAR {activeVariant.id}</div>
                                  <p className="whitespace-pre-wrap">{activeVariant.body}</p>
                                  <div className="text-[9px] text-[#222]/40 text-right mt-1 flex items-center justify-end gap-1 font-bold">
                                    Aperçu <span className="text-blue-500">✓✓</span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* WhatsApp Input */}
                          <div className="bg-[#f0f0f0] p-3 flex items-center gap-3 border-t border-slate-200">
                            <div className="flex-1 bg-white rounded-full h-10 px-4 flex items-center text-slate-300 text-xs font-bold">
                              Écrire un message...
                            </div>
                            <div className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                              <Send size={18} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-4xl mx-auto">
                    {campaigns.length === 0 ? (
                      <div className="bg-[#1e293b]/20 border border-dashed border-slate-800 rounded-[3rem] p-20 text-center space-y-6">
                        <div className="w-24 h-24 bg-slate-800/40 rounded-full flex items-center justify-center mx-auto transition-transform hover:scale-110">
                          <Send size={40} className="text-slate-600" />
                        </div>
                        <div className="space-y-2">
                          <p className="text-slate-400 font-black uppercase tracking-widest text-sm">Le silence est d'or</p>
                          <p className="text-slate-600 text-sm max-w-xs mx-auto font-medium">Votre historique de diffusion est vide. Prêt à faire du bruit ?</p>
                        </div>
                        <button onClick={() => setShowCreate(true)} className="bg-blue-600/20 text-blue-400 border border-blue-500/30 px-6 py-3 rounded-2xl font-black text-xs hover:bg-blue-600/40 transition-all">CRÉER MA PREMIÈRE CAMPAGNE</button>
                      </div>
                    ) : (
                      <div className="grid gap-4">
                        {campaigns.map(c => (
                          <div key={c.id} className="flex flex-col">
                            <div className="group bg-[#1e293b]/30 border border-slate-800/60 hover:border-slate-700/80 rounded-[2rem] p-6 transition-all hover:bg-[#1e293b]/50 flex items-center gap-6">
                              <div className={cn(
                                "w-14 h-14 rounded-2xl flex items-center justify-center transition-all",
                                c.status === 'completed' ? "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white" :
                                c.status === 'scheduled' ? "bg-amber-500/10 text-amber-400 group-hover:bg-amber-500 group-hover:text-white" :
                                "bg-slate-800 text-slate-400 group-hover:bg-blue-600 group-hover:text-white"
                              )}>
                                {c.status === 'scheduled' ? <Clock size={28} /> : <Target size={28} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3">
                                  <h3 className="font-black text-white text-lg truncate pr-4">{c.name}</h3>
                                  <span className={cn(
                                    "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                    c.status === 'completed' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                                    c.status === 'scheduled' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                                    c.status === 'running' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-slate-800 text-slate-500 border-slate-700"
                                  )}>{c.status}</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1 font-medium italic">
                                  {c.status === 'scheduled' ? `Planifié pour le ${new Date(c.scheduled_at!).toLocaleString('fr-FR')}` : `Diffusé ${formatRelativeDate(c.created_at)}`} 
                                  • {c.total_recipients} cibles
                                </p>
                              </div>
                              
                              <div className="hidden md:flex items-center gap-8">
                                <div className="text-right">
                                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-tighter">Succès</p>
                                  <p className="text-lg font-black text-emerald-400">{(c.sent_count / (c.total_recipients || 1) * 100).toFixed(0)}%</p>
                                </div>
                                <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                  <div className="bg-emerald-500 h-full transition-all duration-1000" style={{ width: `${(c.delivered_count / (c.total_recipients || 1)) * 100}%` }} />
                                  <div className="bg-blue-500/50 h-full" style={{ width: `${((c.sent_count - c.delivered_count) / (c.total_recipients || 1)) * 100}%` }} />
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {c.status === 'scheduled' && (
                                  <button 
                                    onClick={() => handleEdit(c)}
                                    className="p-3 bg-slate-800 hover:bg-amber-600 text-slate-400 hover:text-white rounded-xl transition-all"
                                    title="Modifier la planification"
                                  >
                                    <Clock size={18} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => deleteCampaign(c.id)}
                                  className="p-3 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-all"
                                  title="Supprimer l'historique"
                                >
                                  <Trash2 size={18} />
                                </button>
                                <button 
                                  onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                                  className={cn(
                                    "p-3 rounded-xl transition-all",
                                    expandedId === c.id ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500 hover:text-white"
                                  )}
                                >
                                  <ChevronRight size={20} className={cn("transition-transform", expandedId === c.id ? "rotate-90" : "")} />
                                </button>
                              </div>
                            </div>
                            
                            {/* Detailed Info Reveal */}
                            <AnimatePresence>
                              {expandedId === c.id && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden bg-[#1e293b]/10 border-x border-b border-slate-800/40 rounded-b-[2rem] mx-8"
                                >
                                  <div className="p-8 space-y-6">
                                    <div className="flex items-start gap-8">
                                      <div className="flex-1 space-y-2">
                                        <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest">Contenu du message</p>
                                        <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 text-sm text-slate-400 whitespace-pre-wrap leading-relaxed font-mono">
                                          {c.body}
                                        </div>
                                      </div>
                                      <div className="w-48 space-y-4">
                                        <p className="text-[10px] font-black uppercase text-slate-600 tracking-widest text-right">Performances</p>
                                        <div className="grid grid-cols-1 gap-2">
                                          <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 flex justify-between items-center">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase">Livrés</span>
                                            <span className="text-sm font-black text-emerald-400">{c.delivered_count}</span>
                                          </div>
                                          <div className="bg-slate-900/40 p-3 rounded-xl border border-slate-800/50 flex justify-between items-center">
                                            <span className="text-[10px] text-slate-500 font-bold uppercase">Échoués</span>
                                            <span className="text-sm font-black text-rose-500">{c.failed_count}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </main>

            {/* Global Errors Toast-style */}
            <AnimatePresence>
              {errorMsg && !showCreate && (
                <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
                            className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-2xl flex items-center gap-3 z-[100]">
                  <AlertCircle size={20} />
                  {errorMsg}
                </motion.div>
              )}
            </AnimatePresence>

            <style jsx global>{`
              .custom-scrollbar::-webkit-scrollbar { width: 6px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 20px; }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59,130,246,0.2); }
              .scrollbar-hide::-webkit-scrollbar { display: none; }
            `}</style>

        </div>
    )
}
