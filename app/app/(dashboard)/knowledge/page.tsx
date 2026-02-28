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

            {/* ── Formulaire ajout ─────────────────────────────────────────── */}
            {showAdd && (
                <div className="glass-card p-6 space-y-4 animate-fadeIn">
                    <h2 className="text-lg font-bold text-white">Nouveau document</h2>
                    <div>
                        <label className="block text-xs text-slate-400 mb-2">
                            Section <span className="text-slate-500">(ex: ClassTech, FAQ, Prix...)</span>
                        </label>
                        <input value={section} onChange={e => setSection(e.target.value)}
                            placeholder="BloLab Programmes"
                            className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-400 mb-2">
                            Contenu * <span className="text-slate-500">({content.length} caractères)</span>
                        </label>
                        <textarea value={content} onChange={e => setContent(e.target.value)}
                            placeholder="Ex: ClassTech est un programme de programmation pour enfants de 7 à 17 ans, au tarif de 90 000 FCFA/an à Cotonou..."
                            rows={8}
                            className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                            style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            💡 L'embedding vectoriel (3072d) sera généré via Gemini — prend ~15 secondes
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={addDocument} disabled={saving || !content.trim()}
                            className="btn-primary flex items-center gap-2">
                            {saving
                                ? <><span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block" /> Génération...</>
                                : '💾 Sauvegarder'}
                        </button>
                        {error && (
                            <span className="text-red-400 text-sm">{error}</span>
                        )}
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
                <div className="space-y-3">
                    {docs.map(doc => (
                        <div key={doc.id} className="glass-card p-4 group hover:border-blue-500/20 transition-all"
                            style={{ border: '1px solid rgba(30, 58, 95, 0.4)' }}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2">
                                        {doc.metadata?.section && (
                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                                style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
                                                {doc.metadata.section}
                                            </span>
                                        )}
                                        <span className="text-xs text-slate-600">#{doc.id}</span>
                                        {doc.metadata?.char_count && (
                                            <span className="text-xs text-slate-600">{doc.metadata.char_count} chars</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-300 leading-relaxed">
                                        {truncate(doc.content, 300)}
                                    </p>
                                </div>
                                <button onClick={() => deleteDoc(doc.id)}
                                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded transition-all flex-shrink-0 hover:bg-red-500/10">
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
