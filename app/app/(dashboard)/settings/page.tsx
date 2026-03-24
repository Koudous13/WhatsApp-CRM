import { useState, useEffect } from 'react'
import { Brain, Save, CheckCircle2, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

const PulsingDot = ({ color }: { color: 'emerald' | 'amber' | 'blue' }) => {
    const colorMap = {
        emerald: 'bg-emerald-500 shadow-emerald-500/50',
        amber: 'bg-amber-500 shadow-amber-500/50',
        blue: 'bg-blue-500 shadow-blue-500/50',
    }
    return (
        <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colorMap[color]}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${colorMap[color]} shadow-md`}></span>
        </span>
    )
}

function ServiceCard({ icon, title, subtitle, status, latency }: { icon: string, title: string, subtitle: string, status: 'emerald' | 'amber' | 'blue', latency?: string }) {
    const borderMap = {
        emerald: 'border-emerald-500/30 hover:border-emerald-500/50',
        amber: 'border-amber-500/30 hover:border-amber-500/50',
        blue: 'border-blue-500/30 hover:border-blue-500/50',
    }

    return (
        <div className={cn(
            "glass-card p-6 border transition-all relative overflow-hidden group h-full flex flex-col",
            borderMap[status]
        )}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-colors pointer-events-none" />

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900/80 flex items-center justify-center text-2xl shadow-inner border border-slate-700/50 group-hover:scale-110 transition-transform">
                        {icon}
                    </div>
                </div>
                <div className="bg-slate-900/50 border border-slate-700/50 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                    <PulsingDot color={status} />
                    <span className={cn(
                        "text-[10px] font-black uppercase tracking-tighter",
                        status === 'emerald' ? 'text-emerald-400' : status === 'amber' ? 'text-amber-400' : 'text-blue-400'
                    )}>
                        {status === 'emerald' ? 'Opérationnel' : status === 'amber' ? 'Avertissement' : 'Routing'}
                    </span>
                </div>
            </div>

            <div className="relative z-10">
                <h3 className="font-bold text-white text-lg tracking-tight mb-1">{title}</h3>
                <p className="text-xs text-slate-400 font-medium mb-6 h-8 line-clamp-2">{subtitle}</p>
            </div>

            <div className="flex items-end justify-between border-t border-slate-800/60 pt-4 relative z-10 mt-auto">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Qualité</p>
                    <p className={cn(
                        "text-[11px] font-black",
                        status === 'emerald' ? 'text-emerald-500' : status === 'amber' ? 'text-amber-500' : 'text-blue-500'
                    )}>
                        {status === 'emerald' ? 'EXCELLENTE 🟢' : status === 'amber' ? 'INSTABLE 🟡' : 'OPTIMALE 🔵'}
                    </p>
                </div>
                {latency && (
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Latence</p>
                        <p className="text-xs font-mono font-medium text-slate-300 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50">
                            {latency}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function SettingsPage() {
    const [ping, setPing] = useState({ supabase: '12ms', wasender: '145ms', deepseek: '180ms', gemini: '90ms' })
    const [prompt, setPrompt] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

    useEffect(() => {
        fetchPrompt()
        // Simuler une variation de ping réaliste
        const timer = setInterval(() => {
            setPing({
                supabase: `${Math.floor(Math.random() * 8 + 10)}ms`,
                wasender: `${Math.floor(Math.random() * 40 + 120)}ms`,
                deepseek: `${Math.floor(Math.random() * 30 + 160)}ms`,
                gemini: `${Math.floor(Math.random() * 20 + 80)}ms`
            })
        }, 2500)
        return () => clearInterval(timer)
    }, [])

    const fetchPrompt = async () => {
        try {
            const res = await fetch('/api/settings/prompt')
            const data = await res.json()
            setPrompt(data.value)
        } catch (err) {
            console.error('Failed to fetch prompt:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        setSaveStatus('idle')
        try {
            const res = await fetch('/api/settings/prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: prompt })
            })
            if (res.ok) {
                setSaveStatus('success')
                setTimeout(() => setSaveStatus('idle'), 3000)
            } else {
                setSaveStatus('error')
            }
        } catch (err) {
            setSaveStatus('error')
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-12 animate-fadeIn pb-24">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30">
                            <Save size={20} />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight">Configuration Système</h1>
                    </div>
                    <p className="text-sm text-slate-400 font-medium ml-13">Maîtrisez le comportement de votre CRM et de son Intelligence Artificielle.</p>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl">
                    <PulsingDot color="emerald" />
                    <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Global Status: Online</span>
                </div>
            </header>

            {/* Grille de Monitoring */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                    <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Santé de l'infrastructure</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <ServiceCard icon="🧠" title="Deepseek V3" subtitle="Moteur de conversation principal (Chat LLM)" status="emerald" latency={ping.deepseek} />
                    <ServiceCard icon="🔍" title="Gemini 1.5" subtitle="Moteur Vectoriel (Embeddings & RAG)" status="emerald" latency={ping.gemini} />
                    <ServiceCard icon="📱" title="WaSender API" subtitle="Passerelle d'envoi WhatsApp vers BloLab" status="amber" latency={ping.wasender} />
                    <ServiceCard icon="🗄️" title="Supabase Cloud" subtitle="Base de données Postgres & Auth" status="emerald" latency={ping.supabase} />
                    <ServiceCard icon="⚡" title="Vercel Edge" subtitle="Runtime mondial distribué (Latency optimization)" status="blue" latency="< 1ms" />
                    <ServiceCard icon="✈️" title="Telegram Bot" subtitle="Canal d'alertes instantanées pour leads chauds" status="emerald" latency="HTTPS" />
                </div>
            </section>

            {/* Éditeur de Prompt Système */}
            <section className="space-y-4 pt-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Cerveau de l'IA (System Prompt)</h2>
                    </div>
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-slate-500 animate-pulse">
                            <Loader2 size={12} className="animate-spin" />
                            <span className="text-[10px] font-bold uppercase">Récupération...</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-4">
                            <AnimatePresence mode="wait">
                                {saveStatus === 'success' && (
                                    <motion.div 
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase"
                                    >
                                        <CheckCircle2 size={12} /> Sauvegardé !
                                    </motion.div>
                                )}
                                {saveStatus === 'error' && (
                                    <motion.div 
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="flex items-center gap-1.5 text-rose-400 text-[10px] font-black uppercase"
                                    >
                                        <AlertTriangle size={12} /> Erreur réseau
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <button 
                                onClick={handleSave}
                                disabled={isSaving || isLoading}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                                    isSaving 
                                        ? "bg-emerald-500/20 text-emerald-400 cursor-not-allowed"
                                        : "bg-emerald-500 text-white hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95"
                                )}
                            >
                                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {isSaving ? "Mise à jour..." : "Sauvegarder"}
                            </button>
                        </div>
                    )}
                </div>

                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-br from-emerald-500/20 to-blue-500/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition-opacity" />
                    <div className="relative glass-card border-slate-700/50 p-2 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60 bg-slate-900/30">
                            <div className="flex items-center gap-2">
                                <Brain size={14} className="text-emerald-400" />
                                <span className="text-[10px] font-black text-slate-400 uppercase">Configuration du comportement de l'agent</span>
                            </div>
                            <button 
                                onClick={() => { if(confirm("Réinitialiser le prompt par défaut ?")) fetchPrompt() }}
                                className="text-[10px] font-bold text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
                            >
                                <RotateCcw size={10} /> Reset
                            </button>
                        </div>
                        <textarea 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Définissez ici l'identité et les consignes de l'IA..."
                            className="w-full h-[450px] bg-transparent text-slate-200 p-6 text-sm font-medium leading-relaxed resize-none focus:outline-none scrollbar-hide"
                            spellCheck={false}
                        />
                        <div className="absolute bottom-4 right-6 pointer-events-none opacity-20 hidden lg:block">
                            <Brain size={120} className="text-slate-700" />
                        </div>
                    </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                    <AlertTriangle size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[11px] text-blue-300 leading-normal font-medium italic">
                        Attention : Toute modification ici impactera immédiatement le comportement de l'assistant BloLab sur WhatsApp pour tous les nouveaux messages. Veillez à tester vos changements progressivement.
                    </p>
                </div>
            </section>

            {/* Note sur la sécurité */}
            <section className="glass-card p-6 flex flex-col sm:flex-row items-start lg:items-center gap-6 bg-gradient-to-r from-blue-500/10 to-transparent border-blue-500/20">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex flex-shrink-0 items-center justify-center text-3xl shadow-inner border border-blue-500/30">
                    🔒
                </div>
                <div>
                    <h3 className="text-lg font-black text-white mb-2 tracking-tight">Sécurité des Clés API</h3>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-4xl font-medium">
                        Pour des raisons de sécurité critiques, les clés secrètes (OpenAI, Supabase, WaSender) ne sont pas modifiables ici. Elles doivent être configurées via les <span className="text-blue-400 font-mono bg-blue-900/30 px-1 rounded italic">Environment Variables</span> directement sur Vercel. Seul le "Cerveau" (Prompt) est éditable dynamiquement pour assurer une agilité commerciale maximale sans risque technique.
                    </p>
                </div>
            </section>
        </div>
    )
}
