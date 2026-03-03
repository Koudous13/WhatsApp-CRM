'use client'

import { useEffect, useState } from 'react'
import { truncate } from '@/lib/utils'

type Document = {
    id: number
    content: string
    metadata: Record<string, any>
}

export default function KnowledgePage() {
    const [docs, setDocs] = useState<Document[]>([])
    const [showAdd, setShowAdd] = useState(false)
    const [saving, setSaving] = useState(false)
    const [content, setContent] = useState('')
    const [section, setSection] = useState('')
    const [error, setError] = useState('')
    const [toast, setToast] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => { load() }, [])

    async function load() {
        setLoading(true)
        const res = await fetch('/api/knowledge/list')
        const json = await res.json()
        setDocs(json.documents ?? [])
        setLoading(false)
    }

    function showToast(msg: string) {
        setToast(msg)
        setTimeout(() => setToast(''), 4000)
    }

    async function addDocument() {
        if (!content.trim()) return
        setSaving(true)
        setError('')
        try {
            const res = await fetch('/api/knowledge/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, section }),
            })
            const json = await res.json()
            if (!res.ok) {
                setError(`Erreur: ${json.error ?? res.status}`)
                return
            }
            setContent(''); setSection(''); setShowAdd(false)
            showToast(`✅ Document #${json.id} ajouté avec succès !`)
            load()
        } catch (e: any) {
            setError(`Erreur réseau: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function deleteDoc(id: number) {
        if (!confirm('Supprimer ce document ?')) return
        await fetch(`/api/knowledge/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        })
        setDocs(prev => prev.filter(d => d.id !== id))
        showToast('🗑️ Document supprimé')
    }

    return (
        <div className="p-8 max-w-5xl space-y-6">

            {/* ── Toast fixe en haut ───────────────────────────────────────── */}
            {toast && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fadeIn
          px-6 py-3 rounded-2xl text-sm font-semibold shadow-2xl
          bg-emerald-500/90 text-white backdrop-blur-md border border-emerald-400/30"
                    style={{ minWidth: '260px', textAlign: 'center' }}>
                    {toast}
                </div>
            )}

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white">Base de connaissances</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {loading ? '...' : `${docs.length} documents`} • utilisés par le RAG IA
                    </p>
                </div>
                <button onClick={() => { setShowAdd(!showAdd); setError('') }} className="btn-primary">
                    {showAdd ? '✕ Annuler' : '+ Ajouter un document'}
                </button>
            </div>

            {/* ── Slide-over Ajout ─────────────────────────────────────────── */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex justify-end animate-fadeIn">
                    <div className="absolute inset-0 bg-[#0a0f1e]/80 backdrop-blur-sm transition-opacity" onClick={() => setShowAdd(false)} />
                    <div className="relative w-full max-w-md h-full bg-[#0f172a] shadow-2xl border-l border-blue-500/20 flex flex-col transform transition-transform duration-300 translate-x-0">
                        <div className="p-6 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/50">
                            <div>
                                <h2 className="text-lg font-bold text-white">Nouveau document</h2>
                                <p className="text-xs text-slate-400">Enrichissez la base IA</p>
                            </div>
                            <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors">
                                ✕
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-2">
                                    Section <span className="text-slate-500">(Optionnelle)</span>
                                </label>
                                <input value={section} onChange={e => setSection(e.target.value)}
                                    placeholder="Ex: FAQ, Programmes, Tarifs"
                                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-900/50 border border-slate-700/50"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <label className="block text-xs font-medium text-slate-400">Contenu *</label>
                                    <span className="text-[10px] text-slate-500">{content.length} / 5000</span>
                                </div>
                                <textarea value={content} onChange={e => setContent(e.target.value)}
                                    placeholder="Ex: ClassTech coûte 90 000 FCFA..."
                                    rows={12}
                                    className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none bg-slate-900/50 border border-slate-700/50"
                                />
                                <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 text-xs text-blue-200/80 flex gap-4 mt-6">
                                    <span className="text-2xl leading-none">🧠</span>
                                    <p className="leading-relaxed font-medium">Ce texte sera découpé, vectorisé et stocké dans l'espace multidimensionnel pour être exploité par l'Agent Deepseek.</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-800/60 bg-slate-900/50">
                            {error && <div className="mb-4 text-xs font-medium text-red-400 bg-red-400/10 p-3 rounded-lg border border-red-500/20">❌ {error}</div>}
                            <button onClick={addDocument} disabled={saving || !content.trim()}
                                className="w-full btn-primary py-3 flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-500/20 transition-all">
                                {saving ? <><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" /> Vectorisation en cours...</> : '💾 Ajouter à la base secrète'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Liste documents ──────────────────────────────────────────── */}
            {loading ? (
                <div className="glass-card p-8 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">Chargement des documents...</p>
                </div>
            ) : docs.length === 0 ? (
                <div className="glass-card p-10 text-center text-slate-500">
                    <div className="text-4xl mb-3">📚</div>
                    <p className="font-medium text-slate-400">Aucun document dans la base de connaissances</p>
                    <p className="text-sm mt-1">Ajoutez des informations sur BloLab pour alimenter l'IA</p>
                </div>
            ) : (
                <div className="columns-1 md:columns-2 lg:columns-3 gap-6 space-y-6">
                    {docs.map(doc => (
                        <div key={doc.id} className="glass-card p-6 group hover:border-blue-500/30 hover:shadow-lg hover:-translate-y-1 transition-all break-inside-avoid relative"
                            style={{ border: '1px solid rgba(30, 58, 95, 0.4)' }}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-3">
                                        {doc.metadata?.section && (
                                            <span className="text-xs font-bold px-3 py-1 rounded-md shadow-sm"
                                                style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
                                                {doc.metadata.section}
                                            </span>
                                        )}
                                        <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50">
                                            <span className="text-[10px] font-mono text-slate-400">#{doc.id}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-200 leading-relaxed font-medium">
                                        {truncate(doc.content, 400)}
                                    </p>
                                </div>
                                <button onClick={() => deleteDoc(doc.id)}
                                    className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100 bg-red-500 text-white w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 border-[#0a0f1e] hover:bg-red-600 transition-all z-10">
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
