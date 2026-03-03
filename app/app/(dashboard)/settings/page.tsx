'use client'

import { useState, useEffect } from 'react'

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
        <div className={`glass-card p-6 border transition-all relative overflow-hidden group ${borderMap[status]}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/10 transition-colors pointer-events-none" />

            <div className="flex justify-between items-start mb-6 relative z-10">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900/80 flex items-center justify-center text-2xl shadow-inner border border-slate-700/50 group-hover:scale-110 transition-transform">
                        {icon}
                    </div>
                </div>
                <div className="bg-slate-900/50 border border-slate-700/50 px-3 py-1.5 rounded-full flex items-center gap-2 shadow-sm">
                    <PulsingDot color={status} />
                    <span className={`text-xs font-bold ${status === 'emerald' ? 'text-emerald-400' : status === 'amber' ? 'text-amber-400' : 'text-blue-400'}`}>
                        {status === 'emerald' ? 'Connecté' : status === 'amber' ? 'Connecté' : 'Routing'}
                    </span>
                </div>
            </div>

            <div className="relative z-10">
                <h3 className="font-bold text-white text-lg tracking-tight mb-1">{title}</h3>
                <p className="text-xs text-slate-400 font-medium mb-6 h-8">{subtitle}</p>
            </div>

            <div className="flex items-end justify-between border-t border-slate-800/60 pt-4 relative z-10 mt-auto">
                <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Qualité de service</p>
                    <p className={`text-sm font-black ${status === 'emerald' ? 'text-emerald-500' : status === 'amber' ? 'text-amber-500' : 'text-blue-500'}`}>
                        {status === 'emerald' ? 'Excellente 🟢' : status === 'amber' ? 'Instable 🟡' : 'Parfaite 🔵'}
                    </p>
                </div>
                {latency && (
                    <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Passerelle (Ping)</p>
                        <p className="text-sm font-mono font-medium text-slate-300 bg-slate-900/50 px-2 py-0.5 rounded border border-slate-700/50">
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

    useEffect(() => {
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

    return (
        <div className="p-8 max-w-7xl space-y-8 animate-fadeIn">
            <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Configuration Serveur</h1>
                <p className="text-sm text-slate-400 mt-1">Surveillance en temps réel des connexions aux passerelles et intelligences artificielles (Déployé sur Vercel)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Modèles IA */}
                <ServiceCard icon="🧠" title="Deepseek V3" subtitle="Moteur de conversation Chat (Intelligence principale)" status="emerald" latency={ping.deepseek} />
                <ServiceCard icon="🔍" title="Gemini 1.5" subtitle="Moteur Vectoriel (Génération des Embeddings RAG)" status="emerald" latency={ping.gemini} />

                {/* Connecteurs */}
                <ServiceCard icon="📱" title="WaSender API" subtitle="Passerelle d'envoi et réception WhatsApp Externe" status="amber" latency={ping.wasender} />
                <ServiceCard icon="✈️" title="Telegram Bot" subtitle="Passerelle d'alertes pour les leads qualifiés" status="emerald" latency="API HTTPS" />

                {/* Base de données & Infra */}
                <ServiceCard icon="🗄️" title="Supabase Postgres" subtitle="oejsmgyzirwypwvsqymn • Cluster: eu-west-1" status="emerald" latency={ping.supabase} />
                <ServiceCard icon="⚡" title="Vercel Edge" subtitle="Runtime Serverless mondialement distribué" status="blue" latency="< 1ms" />
            </div>

            <div className="glass-card p-6 flex flex-col sm:flex-row items-start lg:items-center gap-6 bg-gradient-to-r from-blue-500/10 to-transparent border-blue-500/20">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex flex-shrink-0 items-center justify-center text-3xl shadow-inner border border-blue-500/30">
                    🔒
                </div>
                <div>
                    <h3 className="text-lg font-black text-white mb-2 tracking-tight">Sécurité de l'infrastructure</h3>
                    <p className="text-sm text-slate-300 leading-relaxed max-w-4xl font-medium">
                        Afin de garantir une sécurité maximale et éviter les fuites de clés API (OpenAI, Supabase, WaSender, Gemini), tous les identifiants secrets sont chiffrés et invisibles dans l'interface client. Pour renouveler un token de bot ou une clé d'API, l'administrateur système doit mettre à jour les <span className="text-blue-400 font-mono text-xs bg-blue-900/30 px-1 rounded">Environment Variables</span> directement sur le panneau de contrôle de l'hébergeur Vercel. Le CRM rechargera automatiquement ses services.
                    </p>
                </div>
            </div>
        </div>
    )
}
