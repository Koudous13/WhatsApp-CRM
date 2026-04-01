'use client'

import { useState, useEffect, useRef } from 'react'
import Papa from 'papaparse'

interface FieldInfo {
    name: string;
    type: string;
    is_required: boolean;
}

export default function ProgrammesPage() {
    // --- Data States ---
    const [programmes, setProgrammes] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // --- Active Programme View ---
    const [activeProgramme, setActiveProgramme] = useState<any>(null)
    const [inscrits, setInscrits] = useState<any[]>([])
    const [loadingInscrits, setLoadingInscrits] = useState(false)
    const [searchInscrit, setSearchInscrit] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')

    // --- Modal NOUVEAU PROGRAMME ---
    const [showModal, setShowModal] = useState(false)
    const [saving, setSaving] = useState(false)
    const [progName, setProgName] = useState('')
    const [progSlug, setProgSlug] = useState('')
    const [fields, setFields] = useState<FieldInfo[]>([])
    const [initialCsvData, setInitialCsvData] = useState<any[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    // --- Modal SUPPRESSION PROGRAMME ---
    const [programToDelete, setProgramToDelete] = useState<any>(null)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [isDeleting, setIsDeleting] = useState(false)

    // --- Modal INSCRIT (Ajout/Edition) ---
    const [showInscritModal, setShowInscritModal] = useState(false)
    const [editingInscrit, setEditingInscrit] = useState<any>(null)
    const [inscritForm, setInscritForm] = useState<any>({})
    const [savingInscrit, setSavingInscrit] = useState(false)

    // --- BULK IMPORT (Programme Existant) ---
    const [isImporting, setIsImporting] = useState(false)
    const bulkInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchProgrammes()
    }, [])

    useEffect(() => {
        if (activeProgramme) {
            loadInscrits(activeProgramme.slug)
        }
    }, [activeProgramme])

    async function fetchProgrammes() {
        try {
            const res = await fetch('/api/programmes')
            const data = await res.json()
            setProgrammes(data || [])
            // Update activeProgramme if it was selected to refresh fields
            if (activeProgramme) {
                const updated = data.find((p: any) => p.slug === activeProgramme.slug)
                if (updated) setActiveProgramme(updated)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    async function loadInscrits(slug: string) {
        setLoadingInscrits(true)
        try {
            const res = await fetch('/api/programmes') // Hack for supabase context issue, using an api call might be better, but we don't have GET /inscriptions/[slug], so we can use Supabase client directly, but we don't have it imported here. Let's create `GET /api/inscriptions/[slug]`. 
            // Wait, we DO have /api/inscriptions/[slug].
            const resp = await fetch(`/api/inscriptions/${slug}`)
            const data = await resp.json()
            if (!data.error) setInscrits(data)
        } catch (err) {
            console.error(err)
        } finally {
            setLoadingInscrits(false)
        }
    }

    // --- PROGRAMMES LOGIC ---
    const handleNameChange = (val: string) => {
        setProgName(val)
        setProgSlug(val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, ''))
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as any[]
                const headers = results.meta.fields || []
                
                // Convert headers to fields
                const newFields = headers.map(h => ({ name: h, type: 'text', is_required: false }))
                setFields(newFields)
                setInitialCsvData(data)
                
                // Alert if needed
                alert(`${data.length} lignes trouvées et ${headers.length} colonnes détectées.\nVous pouvez ajuster les colonnes avant de générer le programme.`)
            },
            error: (err) => {
                alert(`Erreur de lecture du CSV: ${err.message}`)
            }
        })
    }

    const resetNewProgramForm = () => {
        setProgName('')
        setProgSlug('')
        setFields([])
        setInitialCsvData([])
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleCreateProgram = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            const res = await fetch('/api/programmes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nom: progName,
                    slug: progSlug,
                    fields: fields.filter(f => f.name.trim() !== ''),
                    initialData: initialCsvData
                })
            })
            const result = await res.json()
            if (result.error) {
                alert("Erreur : " + result.error)
            } else {
                setShowModal(false)
                resetNewProgramForm()
                fetchProgrammes()
            }
        } catch (e) {
            alert("Erreur de connexion")
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteProgram = async () => {
        if (!programToDelete || deleteConfirmText !== programToDelete.nom) return
        setIsDeleting(true)
        try {
            const res = await fetch(`/api/programmes/${programToDelete.id}`, { method: 'DELETE' })
            if (res.ok) {
                setProgramToDelete(null)
                setDeleteConfirmText('')
                if (activeProgramme?.id === programToDelete.id) setActiveProgramme(null)
                fetchProgrammes()
            } else {
                const data = await res.json()
                alert(data.error || 'Erreur lors de la suppression')
            }
        } catch (e) {
            alert('Erreur réseau')
        } finally {
            setIsDeleting(false)
        }
    }

    // --- INSCRITS CRUD LOGIC ---
    const openAddInscritModal = () => {
        setEditingInscrit(null)
        setInscritForm({})
        setShowInscritModal(true)
    }

    const openEditInscritModal = (inscrit: any) => {
        setEditingInscrit(inscrit)
        setInscritForm(inscrit)
        setShowInscritModal(true)
    }

    const saveInscrit = async () => {
        if (!activeProgramme) return
        setSavingInscrit(true)
        try {
            const method = editingInscrit ? 'PUT' : 'POST'
            const payload = { ...inscritForm }
            if (editingInscrit) payload.id = editingInscrit.id

            const res = await fetch(`/api/inscriptions/${activeProgramme.slug}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const json = await res.json()
            if (res.ok) {
                setShowInscritModal(false)
                loadInscrits(activeProgramme.slug)
            } else {
                alert(json.error || 'Erreur lors de la sauvegarde')
            }
        } catch (err) {
            alert('Erreur réseau')
        } finally {
            setSavingInscrit(false)
        }
    }

    const deleteInscrit = async (id: string) => {
        if (!activeProgramme || !confirm('Êtes-vous sûr de vouloir supprimer cette inscription définitivement ?')) return;
        try {
            const res = await fetch(`/api/inscriptions/${activeProgramme.slug}?id=${id}`, { method: 'DELETE' })
            if (res.ok) {
                loadInscrits(activeProgramme.slug)
            } else {
                alert('Erreur lors de la suppression')
            }
        } catch (e) {
            alert('Erreur réseau')
        }
    }

    const handleBulkCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!activeProgramme) return
        const file = e.target.files?.[0]
        if (!file) return
        setIsImporting(true)

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data
                try {
                    const res = await fetch(`/api/inscriptions/${activeProgramme.slug}/bulk`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rows: data })
                    })
                    const parsed = await res.json()
                    if (parsed.error) alert(`Erreur: ${parsed.error}`)
                    else {
                        alert(`Import réussi : ${parsed.count} inscrits ajoutés ou mis à jour !`)
                        loadInscrits(activeProgramme.slug)
                    }
                } catch (err) {
                    alert('Erreur réseau lors de l\'import')
                } finally {
                    setIsImporting(false)
                    if (bulkInputRef.current) bulkInputRef.current.value = ''
                }
            },
            error: (err) => {
                alert(`Erreur de lecture du CSV: ${err.message}`)
                setIsImporting(false)
            }
        })
    }

    const renderDynamicTable = () => {
        if (!activeProgramme) return null
        const champs = activeProgramme.programme_champs || []
        const columns = champs.sort((a: any, b: any) => a.display_order - b.display_order).map((c: any) => c.name)
        
        // System columns to display
        const systemCols = ['chat_id', 'status', 'created_at']

        if (loadingInscrits) return <div className="p-12 text-center text-slate-400">Chargement des inscrits...</div>
        if (inscrits.length === 0) return <div className="p-12 text-center text-slate-500 glass-card">Aucun inscrit dans ce programme.</div>

        const filteredInscrits = inscrits.filter(ins => {
            // Filtre par statut
            if (statusFilter !== 'all' && ins.status !== statusFilter) return false;
            
            // Recherche globale: on concatène toutes les valeurs de la ligne
            if (searchInscrit.trim() !== '') {
                const searchStr = searchInscrit.toLowerCase();
                const allValues = Object.values(ins).map(v => String(v).toLowerCase()).join(' ');
                if (!allValues.includes(searchStr)) return false;
            }
            return true;
        });

        return (
            <div className="space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-col md:flex-row gap-4 items-center mb-4">
                    <div className="flex-1 w-full relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
                        <input 
                            type="text" 
                            placeholder="Rechercher par numéro, nom, mail..."
                            value={searchInscrit}
                            onChange={(e) => setSearchInscrit(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-[#1a1432] border border-violet-500/20 rounded-lg text-white text-sm focus:ring-1 focus:ring-violet-500 transition shadow-inner"
                        />
                    </div>
                    <div className="w-full md:w-auto flex gap-2">
                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full md:w-48 px-3 py-2 bg-[#1a1432] border border-violet-500/20 rounded-lg text-white text-sm focus:ring-1 focus:ring-violet-500 transition"
                        >
                            <option value="all">Tous les statuts</option>
                            <option value="pending">En attente (pending)</option>
                            <option value="active">Actif (active)</option>
                        </select>
                    </div>
                </div>

                {filteredInscrits.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 bg-black/20 rounded-xl border border-white/5">
                        Aucun résultat pour cette recherche.
                    </div>
                ) : (
                    <div className="w-full overflow-x-auto rounded-xl border border-violet-500/10 shadow-xl bg-black/20 backdrop-blur-md">
                        <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-[#1a1432]/80 text-violet-300">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Actions</th>
                            {columns.map((col: string) => (
                                <th key={col} className="px-6 py-4 font-semibold whitespace-nowrap">{col}</th>
                            ))}
                            <th className="px-6 py-4 font-semibold">Contact (Chat ID)</th>
                            <th className="px-6 py-4 font-semibold">Statut</th>
                            <th className="px-6 py-4 font-semibold">Date</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-violet-500/10">
                        {filteredInscrits.map((inscrit, idx) => (
                            <tr key={inscrit.id || idx} className="hover:bg-white/5 transition-colors group">
                                <td className="px-6 py-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => openEditInscritModal(inscrit)} className="p-1.5 text-blue-400 hover:bg-blue-400/10 rounded" title="Modifier">✏️</button>
                                        <button onClick={() => deleteInscrit(inscrit.id)} className="p-1.5 text-red-400 hover:bg-red-400/10 rounded" title="Supprimer">🗑️</button>
                                    </div>
                                </td>
                                {columns.map((col: string) => {
                                    const safeName = col.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                                    return (
                                        <td key={col} className="px-6 py-3 text-slate-300 whitespace-nowrap">
                                            {inscrit[safeName] || '-'}
                                        </td>
                                    )
                                })}
                                <td className="px-6 py-3 text-slate-400 font-mono text-xs">{inscrit.chat_id}</td>
                                <td className="px-6 py-3">
                                    <span className={`px-2.5 py-1 rounded text-xs font-semibold ${inscrit.status === 'pending' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                        {inscrit.status || 'Actif'}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-slate-500 whitespace-nowrap">
                                    {inscrit.created_at ? new Date(inscrit.created_at).toLocaleDateString('fr-FR') : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            )}
        </div>
        )
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-200 to-violet-400">
                        {activeProgramme ? `Inscrits : ${activeProgramme.nom}` : 'Gestion des Programmes'}
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {activeProgramme ? 'Gérez manuellement ou en masse les inscrits de ce programme.' : 'Créez des programmes et laissez l\'IA gérer les bases de données dynamiques.'}
                    </p>
                </div>
                
                {activeProgramme ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <button onClick={() => setActiveProgramme(null)} className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition font-medium border border-white/5">
                            ← Retour aux Programmes
                        </button>
                        <button onClick={openAddInscritModal} className="btn-primary flex items-center gap-2 shadow-lg shadow-violet-500/20">
                            + Ajouter un inscrit
                        </button>
                        <input
                            type="file"
                            accept=".csv"
                            ref={bulkInputRef}
                            style={{ display: 'none' }}
                            onChange={handleBulkCsvUpload}
                        />
                        <button onClick={() => bulkInputRef.current?.click()} className="px-4 py-2 bg-[#1a1432] text-violet-300 rounded-lg hover:bg-violet-500/20 transition font-medium border border-violet-500/30 flex items-center gap-2">
                            {isImporting ? <span className="animate-spin w-4 h-4 border-2 border-violet-500/30 border-t-violet-400 rounded-full" /> : '📂'}
                            Importer CSV
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={() => { resetNewProgramForm(); setShowModal(true); }}
                        className="btn-primary flex items-center gap-2 whitespace-nowrap shadow-lg shadow-violet-500/20"
                    >
                        <span className="text-xl">+</span> Nouveau Programme
                    </button>
                )}
            </div>

            {/* Content View */}
            {activeProgramme ? (
                <div className="space-y-4 animate-slideUp">
                    {renderDynamicTable()}
                </div>
            ) : (
                <>
                    {/* Grid Programmes */}
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
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {programmes.map((p) => (
                                <div key={p.id} className="glass-card p-0 flex flex-col group relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-violet-500/10 cursor-pointer" onClick={() => setActiveProgramme(p)}>
                                    <div className="p-6">
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:bg-violet-400/10 transition-colors" />
                                        
                                        <div className="flex justify-between items-start mb-4 relative z-10">
                                            <div>
                                                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-violet-300 transition-colors">{p.nom}</h3>
                                                <div className="flex gap-2 items-center mt-2">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-violet-500/10 text-violet-300 border border-violet-500/20">
                                                        inscript_{p.slug}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-white/5 text-white border border-white/10">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                                        {p.inscritsCount !== undefined ? `${p.inscritsCount} inscrit${p.inscritsCount > 1 ? 's' : ''}` : 'Chargement...'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setProgramToDelete(p); }}
                                                    className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors z-20"
                                                    title="Supprimer ce programme"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-4 border-t border-violet-500/10">
                                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Colonnes Détectées ({p.programme_champs?.length || 0})</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(p.programme_champs || []).slice(0, 5).map((f: any) => (
                                                    <span key={f.id} className="px-2 py-0.5 bg-black/40 text-slate-300 text-[10px] rounded border border-white/5">
                                                        {f.name}
                                                    </span>
                                                ))}
                                                {p.programme_champs?.length > 5 && (
                                                    <span className="px-2 py-0.5 bg-violet-500/10 text-violet-300 text-[10px] rounded">+{p.programme_champs.length - 5} autres</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="px-6 py-3 bg-violet-500/5 border-t border-violet-500/10 text-center text-sm font-medium text-violet-300 hover:bg-violet-500/20 transition-colors">
                                        Voir les Inscrits →
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Modal de création */}
            {showModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
                    <div className="glass-card relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d0a1a] shadow-2xl p-0 border border-violet-500/20">
                        <div className="p-6 border-b border-violet-500/10 sticky top-0 bg-[#0d0a1a]/95 backdrop-blur z-10">
                            <h2 className="text-2xl font-bold text-white">Nouveau Programme</h2>
                            <p className="text-sm text-slate-400 mt-1">Créez votre programme 100% sur-mesure (manuel ou import CSV).</p>
                        </div>

                        <form onSubmit={handleCreateProgram} className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nom du Programme</label>
                                <input 
                                    type="text" 
                                    required
                                    value={progName} 
                                    onChange={e => handleNameChange(e.target.value)}
                                    placeholder="Ex: Formation Développeur Web"
                                    className="w-full px-4 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-white focus:ring-2 focus:ring-violet-500 focus:outline-none placeholder-slate-600 transition-all font-medium text-lg"
                                />
                            </div>

                            <div className="p-4 rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5">
                                <h3 className="text-sm font-semibold text-violet-300 mb-1">🚀 Importation Magique (CSV)</h3>
                                <p className="text-xs text-slate-400 mb-4">Uploadez un fichier CSV pour générer les colonnes automatiquement et importer les données historiques.</p>
                                <input
                                    type="file"
                                    accept=".csv"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-violet-500/20 file:text-violet-300 hover:file:bg-violet-500/30 transition-all cursor-pointer"
                                />
                                
                                <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-200">
                                    💡 <strong>Astuce CRM :</strong> Pour que les inscrits apparaissent sous leur vrai nom dans la page Contacts, nommez vos colonnes <code className="bg-blue-500/20 px-1 py-0.5 rounded text-blue-300 font-mono">prenom</code> et <code className="bg-blue-500/20 px-1 py-0.5 rounded text-blue-300 font-mono">nom</code>. Le numéro de téléphone (obligatoire) peut s'appeler <code className="bg-blue-500/20 px-1 py-0.5 rounded text-blue-300 font-mono">chat_id</code> ou <code className="bg-blue-500/20 px-1 py-0.5 rounded text-blue-300 font-mono">telephone</code>.
                                </div>

                                {initialCsvData.length > 0 && (
                                    <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
                                        <span className="text-2xl">✅</span>
                                        <div>
                                            <p className="text-sm font-semibold text-emerald-400">Fichier prêt pour l'import ({initialCsvData.length} lignes)</p>
                                            <p className="text-xs text-slate-400">Les colonnes ont été extraites ci-dessous. Vous pouvez les renommer ou en ajouter.</p>
                                        </div>
                                        <button type="button" onClick={() => {setInitialCsvData([]); setFields([]); if(fileInputRef.current) fileInputRef.current.value='';}} className="ml-auto text-xs text-slate-500 hover:text-red-400 underline">Annuler</button>
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-slate-300">Schéma Dynamique des Colonnes</label>
                                    <button type="button" onClick={() => setFields([...fields, { name: '', type: 'text', is_required: false }])} className="text-xs font-medium bg-[#1a1432] border border-violet-500/30 text-violet-300 px-3 py-1.5 rounded hover:bg-violet-500/20 transition">
                                        + Ajouter une colonne
                                    </button>
                                </div>
                                
                                {fields.length === 0 ? (
                                    <div className="p-6 text-center border border-dashed border-slate-700 bg-slate-800/20 rounded-xl">
                                        <p className="text-sm text-slate-400">Aucune colonne définie.</p>
                                        <p className="text-xs text-slate-500 mt-1">L'IA ne demandera aucune info, et la table sera vide (sauf contact de base).</p>
                                        <button type="button" onClick={() => setFields([{ name: 'Prénom', type: 'text', is_required: false }, { name: 'Nom', type: 'text', is_required: false }, { name: 'Téléphone', type: 'text', is_required: false }])} className="mt-3 text-xs text-violet-400 hover:text-violet-300 underline">Ajouter les colonnes standards</button>
                                    </div>
                                ) : (
                                    <div className="space-y-2 bg-black/20 p-2 rounded-xl border border-white/5 max-h-48 overflow-y-auto">
                                        {fields.map((f, i) => (
                                            <div key={i} className="flex gap-2 items-center animate-fadeIn bg-slate-900/50 p-2 rounded-lg border border-white/5">
                                                <input 
                                                    type="text" 
                                                    placeholder="Nom (ex: Ville)" 
                                                    value={f.name}
                                                    onChange={e => {
                                                        const nf = [...fields]; nf[i].name = e.target.value; setFields(nf);
                                                    }}
                                                    required
                                                    className="flex-1 px-3 py-1.5 bg-black/40 border border-slate-700/50 rounded text-sm text-white focus:ring-1 focus:ring-violet-500"
                                                />
                                                <select 
                                                    value={f.type}
                                                    onChange={e => {
                                                        const nf = [...fields]; nf[i].type = e.target.value; setFields(nf);
                                                    }}
                                                    className="w-28 px-3 py-1.5 bg-black/40 border border-slate-700/50 rounded text-xs text-slate-300 focus:ring-1 focus:ring-violet-500"
                                                >
                                                    <option value="text">Texte</option>
                                                    <option value="number">Nombre</option>
                                                </select>
                                                <button type="button" onClick={() => setFields(fields.filter((_, idx) => idx !== i))} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition">
                                                    🗑️
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-violet-500/10 flex justify-end gap-3 sticky bottom-0 bg-[#0d0a1a] pb-2">
                                <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition">
                                    Annuler
                                </button>
                                <button type="submit" disabled={saving || !progName.trim()} className="btn-primary flex items-center gap-2">
                                    {saving ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <span>⚡</span>} 
                                    {saving ? 'Génération en cours...' : (initialCsvData.length > 0 ? 'Créer & Importer' : 'Créer le Programme')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Supression Programme (Keep Logic) */}
            {programToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isDeleting && setProgramToDelete(null)} />
                    <div className="glass-card relative w-full max-w-md bg-[#0d0a1a] shadow-2xl p-6 border border-red-500/30 animate-fadeIn">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4 text-3xl">⚠️</div>
                            <h2 className="text-xl font-bold text-white">Zone de Danger</h2>
                            <p className="text-sm text-slate-400 mt-2">Vous êtes sur le point de supprimer <strong className="text-white">{programToDelete.nom}</strong>.</p>
                            <p className="text-xs text-red-400 mt-2 font-medium bg-red-500/10 p-2 rounded border border-red-500/20">Drop Table SQL et destruction de tous les inscrits.</p>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">Tapez <strong className="text-red-400 font-mono select-none">{programToDelete.nom}</strong> :</label>
                                <input 
                                    type="text" 
                                    value={deleteConfirmText}
                                    onChange={e => setDeleteConfirmText(e.target.value)}
                                    className="w-full px-4 py-2 bg-slate-900/50 border border-red-500/30 rounded-lg text-white focus:ring-2 focus:ring-red-500 focus:outline-none placeholder-slate-700"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-red-500/20">
                                <button type="button" onClick={() => setProgramToDelete(null)} className="px-4 py-2 rounded-lg text-slate-400 hover:bg-white/5">Annuler</button>
                                <button type="button" onClick={handleDeleteProgram} disabled={isDeleting || deleteConfirmText !== programToDelete.nom} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-500 disabled:opacity-50">Confirmer</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal CRUD Inscrit Dynamique */}
            {showInscritModal && activeProgramme && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !savingInscrit && setShowInscritModal(false)} />
                    <div className="glass-card relative w-full max-w-md bg-[#0d0a1a] shadow-2xl p-0">
                        <div className="p-6 border-b border-violet-500/10">
                            <h2 className="text-xl font-bold text-white">{editingInscrit ? 'Modifier Inscription' : 'Nouvelle Inscription'}</h2>
                            <p className="text-sm text-slate-400">Programme: {activeProgramme.nom}</p>
                        </div>
                        <form onSubmit={(e) => { e.preventDefault(); saveInscrit(); }} className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            {/* Champs Sys : chat_id et status */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Contact (Chat ID / Tél) *</label>
                                <input 
                                    type="text" 
                                    required
                                    value={inscritForm.chat_id || ''}
                                    onChange={e => setInscritForm({...inscritForm, chat_id: e.target.value})}
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-white text-sm"
                                    placeholder="Ex: 22997000000"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Statut</label>
                                <select 
                                    value={inscritForm.status || 'pending'}
                                    onChange={e => setInscritForm({...inscritForm, status: e.target.value})}
                                    className="w-full px-3 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-white text-sm"
                                >
                                    <option value="pending">En attente (pending)</option>
                                    <option value="active">Actif (active)</option>
                                </select>
                            </div>
                            <div className="border-t border-violet-500/10 my-4"></div>
                            
                            {/* Champs Dynamiques */}
                            {(activeProgramme.programme_champs || []).sort((a:any, b:any) => a.display_order - b.display_order).map((c: any) => {
                                const safeName = c.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                                return (
                                    <div key={c.name}>
                                        <label className="block text-sm font-medium text-slate-300 mb-1">
                                            {c.name} {c.is_required && <span className="text-violet-400">*</span>}
                                        </label>
                                        <input 
                                            type={c.type === 'number' ? 'number' : 'text'}
                                            required={c.is_required}
                                            value={inscritForm[safeName] || ''}
                                            onChange={e => setInscritForm({...inscritForm, [safeName]: e.target.value})}
                                            className="w-full px-3 py-2 bg-slate-900/50 border border-violet-500/20 rounded-lg text-white text-sm focus:ring-1 focus:ring-violet-500"
                                        />
                                    </div>
                                )
                            })}

                            <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-[#0d0a1a]">
                                <button type="button" onClick={() => setShowInscritModal(false)} className="px-4 py-2 text-sm text-slate-400">Annuler</button>
                                <button type="submit" disabled={savingInscrit} className="btn-primary text-sm px-6 py-2">
                                    {savingInscrit ? '...' : 'Sauvegarder'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
