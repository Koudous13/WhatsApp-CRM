'use client'

import { useEffect, useState, useRef } from 'react'
import { truncate } from '@/lib/utils'
import { 
  Plus, Search, FileText, Globe, Upload, Trash2, 
  ChevronDown, ChevronUp, Edit3, Save, X, ExternalLink, 
  BookOpen, Layers, Info, CheckCircle2, AlertCircle, Loader2
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

type Document = {
  id: number
  content: string
  metadata: {
    section?: string
    source?: string
    filename?: string
    created_at?: string
    [key: string]: any
  }
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // États pour l'ajout
  const [addMode, setAddMode] = useState<'text' | 'file' | 'url'>('text')
  const [content, setContent] = useState('')
  const [section, setSection] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  // État pour l'édition
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/knowledge/list')
      const json = await res.json()
      setDocs(json.documents ?? [])
    } catch (e) {
      showToast('Erreur lors du chargement', 'error')
    } finally {
      setLoading(false)
    }
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  async function handleAdd() {
    setSaving(true)
    try {
      let res;
      if (addMode === 'text') {
        res = await fetch('/api/knowledge/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, section }),
        })
      } else if (addMode === 'url') {
        res = await fetch('/api/knowledge/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
      } else {
        const formData = new FormData()
        if (file) formData.append('file', file)
        formData.append('section', section)
        res = await fetch('/api/knowledge/upload', {
          method: 'POST',
          body: formData,
        })
      }

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur lors de l\'opération')

      showToast(addMode === 'url' ? '🔗 URL scrapée et indexée !' : '✅ Document ajouté avec succès !')
      resetAddForm()
      setShowAdd(false)
      load()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function resetAddForm() {
    setContent(''); setSection(''); setUrl(''); setFile(null)
  }

  async function deleteDoc(id: number) {
    if (!confirm('Voulez-vous vraiment supprimer ce document de la base ?')) return
    try {
      const res = await fetch(`/api/knowledge/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Erreur suppression')
      setDocs(docs.filter(d => d.id !== id))
      showToast('🗑️ Document retiré de la base')
    } catch (e) {
      showToast('Erreur suppression', 'error')
    }
  }

  async function saveEdit(doc: Document) {
    if (!editContent.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/knowledge/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: doc.id, content: editContent, metadata: doc.metadata }),
      })
      if (!res.ok) throw new Error('Erreur mise à jour')
      showToast('✏️ Document mis à jour et re-vectorisé')
      setEditingId(null)
      load()
    } catch (e: any) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const filteredDocs = docs.filter(doc => 
    doc.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
    doc.metadata?.section?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fadeIn">
      
      {/* ── Toast ────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-xl animate-slideDown ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="font-bold text-sm">{toast.msg}</span>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
            <BookOpen className="text-blue-500" size={32} />
            Le Cerveau <span className="text-blue-500">Augmenté</span>
          </h1>
          <p className="text-slate-400 mt-2 font-medium flex items-center gap-2">
            <Layers size={16} />
            {loading ? 'Consultation des archives...' : `${docs.length} segments de connaissances indexés`}
          </p>
        </div>
        <button 
          onClick={() => setShowAdd(true)} 
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 hover:-translate-y-1 active:scale-95"
        >
          <Plus size={20} strokeWidth={3} />
          NOUVEAU SAVOIR
        </button>
      </div>

      {/* ── Search Bar ─────────────────────────────────────────────── */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
          <Search size={18} className="text-slate-500 group-focus-within:text-blue-500 transition-colors" />
        </div>
        <input 
          type="text"
          placeholder="Rechercher une formation, un prix, un mot-clé..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[#1e293b]/40 border border-slate-800/60 focus:border-blue-500/50 rounded-2xl py-4 pl-14 pr-6 text-white text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-500/5 transition-all backdrop-blur-md"
        />
      </div>

      {/* ── Document List (Accordion Design) ────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-blue-500" size={40} />
          <p className="text-slate-500 font-bold tracking-widest text-xs uppercase">Initialisation des vecteurs...</p>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-[#1e293b]/20 border border-dashed border-slate-800 rounded-3xl p-16 text-center space-y-4">
          <div className="w-20 h-20 bg-slate-800/40 rounded-full flex items-center justify-center mx-auto">
            <BookOpen size={32} className="text-slate-600" />
          </div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Le cerveau est vide</p>
          <p className="text-slate-600 text-sm max-w-xs mx-auto font-medium">Commencez par importer du contenu pour permettre à l'IA de répondre aux prospects.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDocs.map((doc, idx) => (
            <div 
              key={doc.id} 
              className={`bg-[#1e293b]/30 border transition-all duration-300 overflow-hidden ${
                expandedId === doc.id 
                  ? 'border-blue-500/50 shadow-2xl shadow-blue-500/10 rounded-[2rem]' 
                  : 'border-slate-800/60 hover:border-slate-700/80 rounded-2xl'
              }`}
            >
              {/* Accordion Header */}
              <div 
                onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                className="p-5 flex items-center justify-between cursor-pointer select-none group"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`p-2 rounded-xl transition-colors ${
                    expandedId === doc.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700'
                  }`}>
                    {doc.metadata?.source ? <Globe size={18} /> : doc.metadata?.filename ? <FileText size={18} /> : <FileText size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-blue-400/80">{doc.metadata?.section || 'Général'}</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-100 truncate pr-4">
                      {expandedId === doc.id ? 'Détails du document' : truncate(doc.content, 120)}
                    </h3>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col items-end opacity-40">
                    <span className="text-[10px] font-bold text-slate-400 italic">Vectorisé le</span>
                    <span className="text-[10px] font-bold text-slate-500">{new Date(doc.metadata?.created_at || '').toLocaleDateString('fr-FR')}</span>
                  </div>
                  {expandedId === doc.id ? <ChevronUp size={20} className="text-blue-500" /> : <ChevronDown size={20} className="text-slate-600 group-hover:text-slate-400" />}
                </div>
              </div>

              {/* Accordion Content */}
              {expandedId === doc.id && (
                <div className="p-6 border-t border-slate-800/60 bg-slate-900/40 animate-slideUp">
                  {editingId === doc.id ? (
                    <div className="space-y-4">
                      <textarea 
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="w-full h-80 bg-slate-950 border border-blue-500/30 rounded-2xl p-6 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-medium leading-relaxed"
                      />
                      <div className="flex justify-end gap-3">
                        <button onClick={() => setEditingId(null)} className="px-6 py-2 rounded-xl font-bold text-slate-400 hover:text-white transition-colors">ANNULER</button>
                        <button 
                          onClick={() => saveEdit(doc)} 
                          disabled={saving}
                          className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center gap-2 transition-all"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          ENREGISTRER
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-headings:font-black prose-p:text-slate-300">
                        <ReactMarkdown>{doc.content}</ReactMarkdown>
                      </div>
                      
                      {/* Meta info footer */}
                      <div className="flex flex-wrap items-center justify-between pt-6 border-t border-slate-800/40 gap-4">
                        <div className="flex items-center gap-4">
                          {doc.metadata?.source && (
                            <a href={doc.metadata.source} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
                              <ExternalLink size={14} /> LIEN SOURCE
                            </a>
                          )}
                          {doc.metadata?.filename && (
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 italic">
                              <FileText size={14} /> {doc.metadata.filename}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => { setEditingId(doc.id); setEditContent(doc.content) }}
                            className="p-3 bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-xl transition-all"
                          >
                            <Edit3 size={18} />
                          </button>
                          <button 
                            onClick={() => deleteDoc(doc.id)}
                            className="p-3 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Slide-over Ajout ─────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-[#0a0f1e]/80 backdrop-blur-xl animate-fadeIn" onClick={() => !saving && setShowAdd(false)} />
          <div className="relative w-full max-w-xl h-full bg-[#111827] shadow-2xl border-l border-white/5 flex flex-col animate-slideLeft transform transition-all">
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-[#111827]">
              <div>
                <h2 className="text-xl font-black text-white">Nouveau Savoir</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Expansion du réseau neuronal BloLab</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="w-10 h-10 rounded-full bg-slate-800/50 text-slate-400 hover:text-white flex items-center justify-center transition-all hover:rotate-90">
                <X size={20} strokeWidth={3} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Mode Selector */}
              <div className="flex p-1 bg-slate-900/80 rounded-2xl border border-white/5">
                {[
                  { id: 'text', icon: FileText, label: 'Texte' },
                  { id: 'url', icon: Globe, label: 'Lien Web' },
                  { id: 'file', icon: Upload, label: 'Fichier' }
                ].map(mode => (
                  <button
                    key={mode.id}
                    onClick={() => setAddMode(mode.id as any)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-black tracking-tight transition-all ${
                      addMode === mode.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <mode.icon size={18} />
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Form Fields */}
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Thématique / Section</label>
                  <input 
                    value={section} 
                    onChange={e => setSection(e.target.value)}
                    placeholder="Ex: Tarifs 2026, Ecole229, BloBus..."
                    className="w-full px-5 py-4 rounded-2xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-[#1e293b]/40 border border-slate-800/60"
                  />
                </div>

                {addMode === 'text' && (
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Contenu Manuel</label>
                    <textarea 
                      value={content} 
                      onChange={e => setContent(e.target.value)}
                      placeholder="Collez ici l'information brute..."
                      rows={12}
                      className="w-full px-5 py-4 rounded-2xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none bg-[#1e293b]/40 border border-slate-800/60"
                    />
                  </div>
                )}

                {addMode === 'url' && (
                  <div>
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Lien de la ressource</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-5 flex items-center">
                        <Globe size={18} className="text-slate-500" />
                      </div>
                      <input 
                        value={url} 
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-5 py-4 pl-14 rounded-2xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 bg-[#1e293b]/40 border border-slate-800/60"
                      />
                    </div>
                    <p className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[11px] text-blue-400 font-medium leading-relaxed">
                      L'IA va charger cette page, extraire le texte utile et ignorer les menus pour créer une base propre.
                    </p>
                  </div>
                )}

                {addMode === 'file' && (
                  <div className="space-y-4">
                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Document (.docx, .txt, .md)</label>
                    <div 
                      className="border-2 border-dashed border-slate-800 hover:border-blue-500/40 rounded-3xl p-10 text-center transition-all cursor-pointer relative group bg-slate-900/20"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault()
                        if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0])
                      }}
                    >
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => {
                         if (e.target.files?.[0]) setFile(e.target.files[0])
                      }} />
                      {file ? (
                        <div className="space-y-2">
                          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-xl shadow-blue-600/20">
                            <FileText size={24} className="text-white" />
                          </div>
                          <p className="text-sm font-black text-white">{file.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold">{(file.size / 1024).toFixed(1)} KB • Cliquez pour changer</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                            <Plus size={24} className="text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-300">Glissez un fichier ou cliquez</p>
                            <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 tracking-wider">WORD, TXT, MD (MAX 5MB)</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Vectorization Warning/Info */}
                <div className="mt-8 flex gap-4 p-5 rounded-2xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-blue-500/10">
                  <div className="p-2 h-fit bg-blue-500/20 rounded-lg text-blue-400">
                    <Info size={16} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-blue-400 uppercase tracking-widest mb-1">Processus Cognitif</h4>
                    <p className="text-[11px] text-blue-200/60 leading-relaxed font-medium">Le savoir sera encodé dans un espace multi-dimensionnel de plus de 768 axes pour permettre à l'IA de le retrouver mathématiquement par proximité sémantique.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 border-t border-white/5 bg-[#111827]">
              <button 
                onClick={handleAdd}
                disabled={saving || (addMode === 'text' && !content.trim()) || (addMode === 'url' && !url.trim()) || (addMode === 'file' && !file)}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:translate-y-0 text-white py-5 rounded-2xl font-black text-sm tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-blue-600/20 hover:-translate-y-1 active:scale-95 group"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} strokeWidth={3} className="group-hover:rotate-180 transition-transform duration-500" />}
                {saving ? 'VECTORISATION...' : 'INTÉGRER AU RÉSEAU'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
