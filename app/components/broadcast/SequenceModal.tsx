'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { X, Calendar, MessageSquare, Plus, Send, Target, Clock, Zap, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Programme = { id: string; nom: string; slug: string }

interface SequenceModalProps {
    onClose: () => void
    programmes: Programme[]
    onSuccess: () => void
}

export default function SequenceModal({ onClose, programmes, onSuccess }: SequenceModalProps) {
    const [name, setName] = useState('')
    const [programmeNom, setProgrammeNom] = useState('')
    const [startDate, setStartDate] = useState('')
    const [filterOptIn, setFilterOptIn] = useState(true)
    const [steps, setSteps] = useState([{ offsetDays: 0, sendTime: '10:00', body: '' }])
    
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [programmeTags, setProgrammeTags] = useState<{name: string, type: string}[]>([])
    const [fetchingTags, setFetchingTags] = useState(false)

    const supabase = createClient()

    useEffect(() => {
        if (!programmeNom) {
            setProgrammeTags([])
            return
        }
        async function fetchTags() {
            setFetchingTags(true)
            try {
                // Trouver le programme par nom
                const prog = programmes.find(p => p.nom === programmeNom)
                if (prog) {
                    const { data } = await supabase.from('programme_champs').select('name, type').eq('programme_id', prog.id)
                    if (data) {
                        setProgrammeTags(data)
                    }
                }
            } catch (err) {
                console.error(err)
            } finally {
                setFetchingTags(false)
            }
        }
        fetchTags()
    }, [programmeNom, programmes, supabase])

    const insertTag = (index: number, tagName: string) => {
        const textarea = document.getElementById(`step-textarea-${index}`) as HTMLTextAreaElement
        const tag = `{${tagName}}`
        
        if (!textarea) {
            updateStep(index, 'body', steps[index].body + tag)
            return
        }
        
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const text = textarea.value
        const before = text.substring(0, start)
        const after = text.substring(end)
        const newValue = before + tag + after
        
        updateStep(index, 'body', newValue)
        
        setTimeout(() => {
            textarea.focus()
            textarea.setSelectionRange(start + tag.length, start + tag.length)
        }, 0)
    }

    const addStep = () => {
        const lastOffset = steps.length > 0 ? steps[steps.length - 1].offsetDays : 0
        setSteps([...steps, { offsetDays: lastOffset + 1, sendTime: '10:00', body: '' }])
    }

    const removeStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index))
    }

    const updateStep = (index: number, field: 'offsetDays' | 'body' | 'sendTime', value: any) => {
        const newSteps = [...steps]
        newSteps[index] = { ...newSteps[index], [field]: value }
        setSteps(newSteps)
    }

    const applyTemplate = () => {
        setSteps([
            { offsetDays: 0, sendTime: '10:00', body: 'Bonjour {Prenom}, bienvenue dans le programme !' },
            { offsetDays: 3, sendTime: '10:00', body: 'Bonjour {Prenom}, comment avancez-vous depuis notre dernier échange ?' },
            { offsetDays: 7, sendTime: '10:00', body: 'Bonjour {Prenom}, voici quelques ressources supplémentaires pour vous...' }
        ])
    }

    const handleSubmit = async () => {
        if (!name || !programmeNom || !startDate || steps.length === 0) {
            setError('Veuillez remplir tous les champs obligatoires (Nom, Programme, Date, et au moins 1 étape).')
            return
        }
        
        for (let i = 0; i < steps.length; i++) {
            if (!steps[i].body.trim()) {
                setError(`Le message de l'étape ${i + 1} ne peut pas être vide.`)
                return
            }
        }

        setError('')
        setLoading(true)

        try {
            const res = await fetch('/api/broadcast/sequence/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    programme_nom: programmeNom,
                    startDate,
                    steps,
                    filterOptIn
                })
            })

            const data = await res.json()
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Erreur lors de la création')
            }

            onSuccess()
            onClose()
        } catch (err: any) {
            setError(err.message)
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-[#0f172a] border border-slate-800 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
                    <div>
                        <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 rounded-xl">
                                <Clock size={24} className="text-amber-500" />
                            </div>
                            Séquence de Relances
                        </h2>
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em] mt-1 ml-11">Automation Workflows • Beta</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-800/50 hover:bg-slate-700/80 text-slate-400 hover:text-white rounded-2xl transition-all border border-slate-700/50 hover:border-slate-600 active:scale-95">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Nom de la séquence</label>
                            <input 
                                value={name} onChange={e => setName(e.target.value)}
                                placeholder="Ex: Onboarding Programme X"
                                className="w-full bg-[#1e293b]/40 border border-slate-800 focus:border-amber-500/50 rounded-2xl py-3 px-4 text-white text-sm font-bold outline-none transition-all"
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Programme ciblé</label>
                            <select 
                                value={programmeNom} onChange={e => setProgrammeNom(e.target.value)}
                                className="w-full bg-[#1e293b]/40 border border-slate-800 focus:border-amber-500/50 rounded-2xl py-3 px-4 text-white text-sm font-bold outline-none transition-all appearance-none"
                            >
                                <option value="">-- Choisir un programme --</option>
                                {programmes.map(p => (
                                    <option key={p.id} value={p.nom}>{p.nom}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Date et heure de début (J+0)</label>
                            <input 
                                type="datetime-local"
                                value={startDate} onChange={e => setStartDate(e.target.value)}
                                className="w-full bg-[#1e293b]/40 border border-slate-800 focus:border-amber-500/50 rounded-2xl py-3 px-4 text-white text-sm font-bold outline-none transition-all"
                            />
                        </div>
                        <div className="flex flex-col justify-center space-y-3 pt-6">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <div className={cn(
                                    "w-6 h-6 rounded-md flex items-center justify-center transition-all border",
                                    filterOptIn ? "bg-emerald-500 border-emerald-400" : "bg-slate-800 border-slate-700"
                                )}>
                                    {filterOptIn && <X size={14} className="text-white rotate-45" style={{ transform: 'rotate(0deg)' }} />}
                                </div>
                                <input type="checkbox" checked={filterOptIn} onChange={e => setFilterOptIn(e.target.checked)} className="hidden" />
                                <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">Exclure les désabonnés (Opt-in)</span>
                            </label>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-800 to-transparent my-4" />

                    {/* Steps Editor */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-black text-white flex items-center gap-2">
                                <Target size={20} className="text-blue-500" /> Étapes de la séquence
                            </h3>
                            <button 
                                onClick={applyTemplate}
                                className="px-4 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
                            >
                                <Zap size={14} /> Gabarit J0/J3/J7
                            </button>
                        </div>

                        <div className="space-y-6">
                            {steps.map((step, index) => (
                                <div key={index} className="flex gap-4 p-5 bg-slate-900/60 border border-slate-800 rounded-3xl relative group">
                                    {/* Offset Badge */}
                                    <div className="w-24 shrink-0 flex flex-col gap-3 items-center justify-start border-r border-slate-800/50 pr-4">
                                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Timing</div>
                                        <div className="w-full space-y-2">
                                            <div className="relative group/time">
                                                <input 
                                                    type="number"
                                                    value={step.offsetDays}
                                                    onChange={e => updateStep(index, 'offsetDays', parseInt(e.target.value) || 0)}
                                                    className="w-full bg-[#0a0f1e] border border-slate-800 rounded-xl py-2 px-2 text-amber-500 text-sm font-black text-center outline-none focus:border-amber-500/50 transition-all"
                                                />
                                                <div className="text-[8px] text-center text-slate-600 font-bold mt-1">JOURS</div>
                                            </div>
                                            
                                            <div className="relative group/clock">
                                                <input 
                                                    type="time"
                                                    value={step.sendTime || '10:00'}
                                                    onChange={e => updateStep(index, 'sendTime', e.target.value)}
                                                    className="w-full bg-[#0a0f1e] border border-slate-800 rounded-xl py-2 px-1 text-blue-400 text-[10px] font-black text-center outline-none focus:border-blue-500/50 transition-all"
                                                />
                                                <div className="text-[8px] text-center text-slate-600 font-bold mt-1">HEURE</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Message Body */}
                                    <div className="flex-1 space-y-2">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1">
                                                <MessageSquare size={12} /> Message
                                            </label>
                                            <button 
                                                onClick={() => removeStep(index)}
                                                className="text-slate-600 hover:text-rose-500 transition-colors p-1"
                                                title="Supprimer l'étape"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        {programmeNom && (programmeTags.length > 0 || fetchingTags) ? (
                                            <div className="flex flex-wrap gap-2 mb-3 p-3 bg-slate-950/40 rounded-2xl border border-slate-800/40 backdrop-blur-sm">
                                                <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] w-full mb-1 flex items-center gap-2">
                                                    <Zap size={10} className="text-amber-500" /> Variables du Programme :
                                                </span>
                                                {fetchingTags ? (
                                                    <div className="flex items-center gap-2 px-3 py-1">
                                                        <Loader2 size={12} className="animate-spin text-slate-600" />
                                                        <span className="text-[10px] text-slate-600 font-bold uppercase italic">Chargement...</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {programmeTags.map(t => (
                                                            <button 
                                                                key={t.name}
                                                                onClick={() => insertTag(index, t.name)}
                                                                className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-blue-500/5 text-blue-400 border border-blue-500/10 hover:bg-blue-500 hover:text-white hover:scale-105 transition-all"
                                                                title={`Insérer {${t.name}}`}
                                                            >
                                                                {t.name}
                                                            </button>
                                                        ))}
                                                        {programmeTags.length === 0 && (
                                                            <span className="text-[10px] text-slate-600 font-bold p-2 italic">Aucune colonne spécifique trouvée</span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        ) : null}

                                        <textarea
                                            id={`step-textarea-${index}`}
                                            value={step.body}
                                            onChange={e => updateStep(index, 'body', e.target.value)}
                                            placeholder="Bonjour {Prenom}..."
                                            className="w-full bg-[#1e293b]/20 border border-slate-800/80 focus:border-amber-500/50 rounded-2xl py-3 px-4 text-slate-300 text-sm font-medium outline-none transition-all min-h-[100px] resize-y custom-scrollbar"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button 
                            onClick={addStep}
                            className="w-full py-4 border-2 border-dashed border-slate-800 text-slate-500 hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/5 rounded-3xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> Ajouter une étape
                        </button>
                    </div>

                    {error && (
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-sm font-bold text-center">
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-800/60 bg-slate-900/40 flex justify-end gap-4 shrink-0">
                    <button 
                        onClick={onClose}
                        className="px-6 py-3 rounded-2xl font-black text-xs text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-700 transition-all"
                    >
                        ANNULER
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="bg-amber-600 hover:bg-amber-500 text-white px-8 py-3 rounded-2xl font-black text-xs flex items-center gap-2 shadow-xl shadow-amber-600/20 active:scale-95 transition-all"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        CRÉER LA SÉQUENCE
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
