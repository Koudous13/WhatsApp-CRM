'use client'

import { useState, useEffect } from 'react'

interface FieldInfo {
    name: string;
    type: string;
    is_required: boolean;
}

export default function ProgrammesPage() {
    const [programmes, setProgrammes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [saving, setSaving] = useState(false)

    // Form states
    const [progName, setProgName] = useState('')
    const [progSlug, setProgSlug] = useState('')
    const [fields, setFields] = useState<FieldInfo[]>([])

    useEffect(() => {
        fetchProgrammes()
    }, [])

    async function fetchProgrammes() {
        try {
            const res = await fetch('/api/programmes')
            const data = await res.json()
            setProgrammes(data || [])
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const handleNameChange = (val: string) => {
        setProgName(val)
        // Auto-generate slug
        setProgSlug(val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ''))
    }

    const addField = () => {
        setFields([...fields, { name: '', type: 'text', is_required: true }])
    }

    const updateField = (index: number, key: keyof FieldInfo, value: any) => {
        const newFields = [...fields]
        newFields[index] = { ...newFields[index], [key]: value }
        setFields(newFields)
    }

    const removeField = (index: number) => {
        setFields(fields.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await fetch('/api/programmes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: progName,
                    slug: progSlug,
                    fields: fields.filter(f => f.name.trim() !== '')
                })
            })
            const result = await res.json()
            if (result.error) {
                alert("Erreur : " + result.error)
            } else {
                setShowModal(false)
                setProgName('')
                setProgSlug('')
                setFields([])
                fetchProgrammes()
            }
        } catch (e) {
            alert("Erreur de connexion")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-200 to-violet-400">
                        Gestion des Programmes
                    </h1>
                    <p className="text-slate-400 mt-1">
                        Créez des programmes et laissez l'IA gérer les bases de données dynamiques.
                    </p>
                </div>
                <button 
                    onClick={() => setShowModal(true)}
                    className="btn-primary flex items-center gap-2 whitespace-nowrap"
                >
                    <span className="text-xl">+</span> Nouveau Programme
                </button>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex justify-center p-12">
                    <span className="animate-spin w-8 h-8 border-4 border-violet-500/30 border-t-violet-400 rounded-full" />
                </div>
            ) : programmes.length === 0 ? (
                <div className="glass-card p-12 text-center text-slate-400">
                    <p className="text-4xl mb-3">🗂️</p>
                    <p>Aucun programme créé. Cliquez sur "Nouveau Programme" pour commencer.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {programmes.map((p) => (
                        <div key={p.id} className="glass-card p-6 flex flex-col group relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-violet-500/10">
                            {/* Décoration */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-violet-400/10 transition-colors" />

                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-1 group-hover:text-violet-300 transition-colors">{p.name}</h3>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20">
                                        slug: {p.slug}
                                    </span>
                                </div>
                                <span className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-emerald-400 animate-pulse-dot' : 'bg-red-400'}`} />
                            </div>

                            <div className="mt-4 pt-4 border-t border-violet-500/10 flex-1">
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Champs demandés par l'IA :</p>
                                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-hide pr-2">
                                    {(p.programme_champs ? [...p.programme_champs] : [])
                                        .sort((a: any, b: any) => a.display_order - b.display_order)
                                        .map((f: any) => (
                                        <div key={f.id} className="flex justify-between items-center text-sm py-1">
                                            <span className="text-slate-300 flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-slate-500" />
                                                {f.name}
                                            </span>
                                            <span className="text-xs text-slate-500">{f.type === 'text' ? 'Texte' : 'Nombre'} {f.is_required && '*'}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-4 text-xs text-slate-500 flex justify-between items-center border-t border-violet-500/10">
                                <span>Table générée :</span>
                                <code className="px-1.5 py-0.5 rounded bg-[#0d0a1a] text-violet-200 border border-violet-500/20">
                                    inscript_{p.slug}
                                </code>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de création */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
                    <div className="glass-card relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d0a1a] shadow-2xl p-0">
                        <div className="p-6 border-b border-violet-500/10 sticky top-0 bg-[#0d0a1a]/95 backdrop-blur z-10">
                            <h2 className="text-2xl font-bold text-white">Nouveau Programme</h2>
                            <p className="text-sm text-slate-400 mt-1">Créez un programme et définissez ses champs personnalisés.</p>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Nom du Programme</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={progName} 
                                        onChange={e => handleNameChange(e.target.value)}
                                        placeholder="Ex: École 229"
                                        className="w-full px-4 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-white focus:ring-2 focus:ring-violet-500 focus:outline-none placeholder-slate-600 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Identifiant (Slug)</label>
                                    <input 
                                        type="text" 
                                        required
                                        value={progSlug} 
                                        readOnly
                                        className="w-full px-4 py-2 bg-black/30 border border-violet-500/10 rounded-lg text-slate-400 cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                                <p className="text-sm font-medium text-violet-300 mb-2">Champs de base automatiques</p>
                                <p className="text-xs text-slate-400 mb-3">L'IA demandera toujours ces informations et les inclura dans le tableau :</p>
                                <div className="flex flex-wrap gap-2">
                                    {['Prénom', 'Nom', 'Téléphone', 'Email'].map(f => (
                                        <span key={f} className="px-2 py-1 rounded bg-black/30 text-slate-300 text-xs border border-white/5">{f}</span>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-slate-300">Champs Personnalisés</label>
                                    <button type="button" onClick={addField} className="text-xs font-medium text-violet-400 hover:text-violet-300 px-2 py-1 rounded hover:bg-violet-500/10 transition">
                                        + Ajouter un champ
                                    </button>
                                </div>
                                
                                {fields.length === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-4 border border-dashed border-violet-500/20 rounded-lg">Aucun champ personnalisé défini.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {fields.map((f, i) => (
                                            <div key={i} className="flex gap-3 items-start animate-fadeIn">
                                                <div className="flex-1">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Nom de la question (ex: Parcours choisi)" 
                                                        value={f.name}
                                                        onChange={e => updateField(i, 'name', e.target.value)}
                                                        required
                                                        className="w-full px-3 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-sm text-white focus:ring-1 focus:ring-violet-500"
                                                    />
                                                </div>
                                                <div className="w-32">
                                                    <select 
                                                        value={f.type}
                                                        onChange={e => updateField(i, 'type', e.target.value)}
                                                        className="w-full px-3 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-sm text-slate-300 focus:ring-1 focus:ring-violet-500"
                                                    >
                                                        <option value="text">Texte</option>
                                                        <option value="number">Nombre</option>
                                                        <option value="select">Choix (Bientôt)</option>
                                                    </select>
                                                </div>
                                                <button 
                                                    type="button" 
                                                    onClick={() => removeField(i)}
                                                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-violet-500/10 flex justify-end gap-3">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition">
                                    Annuler
                                </button>
                                <button type="submit" disabled={saving} className="btn-primary">
                                    {saving ? 'Création Base de Données...' : 'Générer le Programme'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
