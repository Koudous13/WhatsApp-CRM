'use client'

import { useState } from 'react'

export default function SettingsPage() {
    return (
        <div className="p-8 max-w-4xl space-y-8 animate-fadeIn">
            <div>
                <h1 className="text-2xl font-black text-white">Paramètres Système</h1>
                <p className="text-sm text-slate-400 mt-1">Gérez la configuration globale du CRM IA BloLab</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* ── Intelligence Artificielle ──────────────────────────────── */}
                <div className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">🧠</span>
                        <h2 className="text-lg font-bold text-white">Modèles IA</h2>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Moteur de complétion (Chat)</label>
                        <select disabled className="w-full px-3 py-2 rounded-lg text-sm text-slate-300 opacity-60 cursor-not-allowed" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(30, 58, 95, 0.4)' }}>
                            <option>Deepseek Chat (V3)</option>
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">Géré via DEEPSEEK_API_KEY dans Vercel</p>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Moteur Vectoriel (Embeddings RAG)</label>
                        <select disabled className="w-full px-3 py-2 rounded-lg text-sm text-slate-300 opacity-60 cursor-not-allowed" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(30, 58, 95, 0.4)' }}>
                            <option>Gemini Embedding-001</option>
                        </select>
                        <p className="text-[10px] text-slate-500 mt-1">Géré via GOOGLE_GENERATIVE_AI_API_KEY dans Vercel</p>
                    </div>
                </div>


                {/* ── Intégrations API ─────────────────────────────────────── */}
                <div className="glass-card p-6 space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">🔌</span>
                        <h2 className="text-lg font-bold text-white">Connecteurs</h2>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Passerelle WhatsApp</label>
                        <input value="https://wasender.blolab.bj (API Externe)" disabled className="w-full px-3 py-2 rounded-lg text-sm text-slate-300 opacity-60 cursor-not-allowed" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(30, 58, 95, 0.4)' }} />
                        <p className="text-[10px] text-emerald-500/70 mt-1">✔ Webhook de réception actif</p>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Alertes Telegram (Lead Chaud)</label>
                        <div className="flex gap-2">
                            <input value="Bot Connecté" disabled className="flex-1 px-3 py-2 rounded-lg text-sm text-emerald-400/80 font-medium opacity-60 cursor-not-allowed" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(16, 185, 129, 0.2)' }} />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">Configuré via TELEGRAM_BOT_TOKEN</p>
                    </div>
                </div>

                {/* ── Base de Données ──────────────────────────────────────── */}
                <div className="glass-card p-6 space-y-4 md:col-span-2">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">🗄️</span>
                        <h2 className="text-lg font-bold text-white">Stockage & Vector Database</h2>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(30, 58, 95, 0.4)' }}>
                        <div>
                            <p className="text-sm font-medium text-white mb-1">Supabase PostgreSQL</p>
                            <p className="text-xs text-slate-400">Projet: oejsmgyzirwypwvsqymn • Région: eu-west-1</p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Connecté
                        </span>
                    </div>

                    <p className="text-xs text-slate-500 italic mt-2 text-center">
                        Note: Les variables d'environnement (Clés API secrètes) doivent être modifiées directement dans l'interface de votre hébergeur (Vercel) pour des raisons de sécurité de production.
                    </p>
                </div>

            </div>
        </div>
    )
}
