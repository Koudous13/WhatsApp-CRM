'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [email, setEmail] = useState('admin@blolab.bj')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const router = useRouter()

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError('')

        const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

        if (authError) {
            setError(`Erreur: ${authError.message}`)
            setLoading(false)
            return
        }

        if (data.session) {
            router.push('/inbox')
            router.refresh()
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4"
            style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0f1e3a 100%)' }}>

            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
                        <span className="text-3xl">🤖</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">BloLab CRM</h1>
                    <p className="text-slate-400 text-sm mt-1">Agent WhatsApp IA</p>
                </div>

                <div className="glass-card p-8">
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full px-4 py-3 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Mot de passe</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••" required
                                className="w-full px-4 py-3 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                            />
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm break-all">
                                {error}
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="btn-primary w-full py-3 text-base flex items-center justify-center gap-2">
                            {loading && <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" />}
                            {loading ? 'Connexion...' : '→ Se connecter'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-600 text-xs mt-6">BloLab • Cotonou & Parakou, Bénin 🇧🇯</p>
            </div>
        </div>
    )
}
