'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatRelativeDate, formatTime, truncate, getInitials } from '@/lib/utils'

type Conversation = {
    id: string
    contact_chat_id: string
    status: string
    last_message_preview: string
    last_message_at: string
    unread_count: number
    Profil_Prospects: {
        prenom: string | null
        nom: string | null
        profil_type: string | null
        score_engagement: number
        statut_conversation: string
    } | null
    category_id: string | null
    Inbox_Categories?: {
        name: string
        color: string
    }
}

type Category = {
    id: string
    name: string
    color: string
}

type Message = {
    id: string
    body: string | null
    direction: string
    message_type: string
    is_ai_response: boolean
    timestamp: string
    delivery_status: string
    transcript: string | null
}

export default function InboxPage() {
    const supabase = createClient()
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [selected, setSelected] = useState<Conversation | null>(null)
    const [messages, setMessages] = useState<Message[]>([])
    const [replyText, setReplyText] = useState('')
    const [sending, setSending] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [activeTab, setActiveTab] = useState<string>('all')
    const [categories, setCategories] = useState<Category[]>([])
    const [isZenMode, setIsZenMode] = useState(false)
    const [isChangingCategory, setIsChangingCategory] = useState<string | null>(null)
    const [handingOver, setHandingOver] = useState(false)
    
    // Create category state
    const [showNewCatForm, setShowNewCatForm] = useState(false)
    const [newCatName, setNewCatName] = useState('')
    const [newCatColor, setNewCatColor] = useState('#3b82f6')
    const [editingCatId, setEditingCatId] = useState<string | null>(null)
    
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Charger conversations et catégories
    useEffect(() => {
        async function load() {
            // Charger les catégories d'abord
            const { data: cats } = await supabase.from('Inbox_Categories').select('*').order('name')
            setCategories(cats || [])

            const { data } = await supabase
                .from('conversations')
                .select(`id, contact_chat_id, status, last_message_preview, last_message_at, unread_count, category_id,
          Profil_Prospects(prenom, nom, profil_type, score_engagement, statut_conversation),
          Inbox_Categories(name, color)`)
                .order('last_message_at', { ascending: false })
            const convs = (data as any) ?? []
            setConversations(convs)

            // Auto-sélection si l'utilisateur arrive depuis Telegram via ?chat_id=XXX
            if (typeof window !== 'undefined') {
                const urlChatId = new URLSearchParams(window.location.search).get('chat_id')
                if (urlChatId) {
                    const c = convs.find((x: any) => x.contact_chat_id === urlChatId)
                    if (c) {
                        // On doit appeler manuellement setSelected et loadMessages 
                        // parce que selectConversation n'est pas encore initialisée lexicalement dans React
                        setSelected(c)

                        // Récupération immédiate des messages
                        const { data: msgs } = await supabase
                            .from('messages')
                            .select('id, body, direction, message_type, is_ai_response, timestamp, delivery_status, transcript')
                            .eq('conversation_id', c.id)
                            .order('timestamp', { ascending: true })
                            .limit(100)
                        setMessages((msgs as any) ?? [])
                        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 300)

                        // Remettre unread_count à 0
                        await supabase.from('conversations').update({ unread_count: 0 }).eq('id', c.id)

                        // Nettoyer l'URL
                        window.history.replaceState({}, '', window.location.pathname)
                    }
                }
            }
        }
        load()

        // Realtime — nouvelles conversations / updates
        const channel = supabase
            .channel('inbox-conversations')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => load())
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
                load()
                if (selected) loadMessages(selected.id)
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [selected?.id])

    async function loadMessages(conversationId: string) {
        const { data } = await supabase
            .from('messages')
            .select('id, body, direction, message_type, is_ai_response, timestamp, delivery_status, transcript')
            .eq('conversation_id', conversationId)
            .order('timestamp', { ascending: true })
            .limit(100)
        setMessages((data as any) ?? [])
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }

    function selectConversation(conv: Conversation) {
        setSelected(conv)
        loadMessages(conv.id)
        // Remettre unread_count à 0
        supabase.from('conversations').update({ unread_count: 0 }).eq('id', conv.id)
    }

    async function sendReply() {
        if (!selected || !replyText.trim()) return
        setSending(true)
        try {
            await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to: selected.contact_chat_id, text: replyText, conversationId: selected.id }),
            })
            setReplyText('')
        } finally {
            setSending(false)
        }
    }

    async function handoverToAI() {
        if (!selected) return
        setHandingOver(true)
        try {
            await fetch('/api/messages/handover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId: selected.id }),
            })
            setSelected({ ...selected, status: 'ai_active' })
        } catch (err) {
            console.error('Erreur Handover', err)
        } finally {
            setHandingOver(false)
        }
    }

    async function takeoverFromAI() {
        if (!selected) return
        setHandingOver(true)
        try {
            await supabase.from('conversations').update({ status: 'assigned' }).eq('id', selected.id)
            setSelected({ ...selected, status: 'assigned' })
        } catch (err) {
            errorChangingCat('Erreur Takeover', err)
        } finally {
            setHandingOver(false)
        }
    }

    async function changeCategory(convId: string, catId: string | null) {
        setIsChangingCategory(convId)
        try {
            const { error } = await supabase
                .from('conversations')
                .update({ category_id: catId })
                .eq('id', convId)
            if (error) throw error
            
            setConversations(prev => prev.map(c => c.id === convId ? { ...c, category_id: catId } : c))
            if (selected?.id === convId) {
                setSelected(prev => prev ? { ...prev, category_id: catId } : null)
            }
        } catch (err) {
            console.error('Erreur changement catégorie', err)
        } finally {
            setIsChangingCategory(null)
        }
    }

    async function createCategory() {
        if (!newCatName.trim()) return
        try {
            const { data, error } = await supabase
                .from('Inbox_Categories')
                .insert([{ name: newCatName, color: newCatColor }])
                .select()
            
            if (error) {
                console.error('Supabase error:', error)
                throw new Error(error.message || JSON.stringify(error))
            }
            
            if (data && data.length > 0) {
                setCategories([...categories, data[0]])
                setNewCatName('')
                setShowNewCatForm(false)
            }
        } catch (err: any) {
            console.error('Erreur création catégorie', err)
            alert("Erreur lors de la création : " + (err instanceof Error ? err.message : JSON.stringify(err)))
        }
    }

    async function updateCategory(id: string, name: string, color: string) {
        try {
            const { error } = await supabase
                .from('Inbox_Categories')
                .update({ name, color })
                .eq('id', id)
            if (error) throw error
            setCategories(prev => prev.map(c => c.id === id ? { ...c, name, color } : c))
            setEditingCatId(null)
        } catch (err) {
            console.error('Erreur update catégorie', err)
        }
    }

    async function deleteCategory(id: string) {
        if (!confirm('Supprimer cette catégorie ? Les conversations resteront mais ne seront plus classées.')) return
        try {
            const { error } = await supabase
                .from('Inbox_Categories')
                .delete()
                .eq('id', id)
            if (error) throw error
            setCategories(prev => prev.filter(c => c.id !== id))
            if (activeTab === id) setActiveTab('all')
            // Update local convs
            setConversations(prev => prev.map(c => c.category_id === id ? { ...c, category_id: null } : c))
        } catch (err) {
            console.error('Erreur delete catégorie', err)
        }
    }

    function errorChangingCat(msg: string, err: any) {
        console.error(msg, err)
    }

    const filtered = conversations.filter(c => {
        const name = `${c.Profil_Prospects?.prenom ?? ''} ${c.Profil_Prospects?.nom ?? ''} ${c.contact_chat_id}`.toLowerCase()
        if (!name.includes(searchQuery.toLowerCase())) return false

        if (activeTab === 'all') return true
        
        // Smart Routing classique (Exclusion mutuelle si catégorie personnalisée présente)
        if (activeTab === 'action') {
            return (c.status === 'escalated' || c.status === 'assigned') && !c.category_id
        }
        if (activeTab === 'ai') {
            return c.status === 'ai_active' && !c.category_id
        }
        if (activeTab === 'closed') {
            return c.status === 'resolved' && !c.category_id
        }
        
        // Filtrage par catégorie dynamique UUID
        return c.category_id === activeTab
    })

    const statusColors: Record<string, string> = {
        ai_active: 'bg-emerald-500',
        escalated: 'bg-amber-500',
        assigned: 'bg-blue-500',
        resolved: 'bg-slate-500',
    }

    return (
        <div className="flex h-screen overflow-hidden">
            {/* ── Panneau conversations (1ère Colonne) ──────────────── */}
            <div className="w-80 flex flex-col flex-shrink-0 border-r" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                <div className="p-4 border-b" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                    <h1 className="text-lg font-bold text-white mb-3">Inbox</h1>
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Rechercher..."
                        className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
                        style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                    />
                    {/* Smart Routing Tabs */}
                    <div className="flex p-1 bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-x-auto scrollbar-hide relative group/tabs">
                        <button onClick={() => setActiveTab('all')} className={cn("flex-1 text-[9px] font-bold py-1.5 rounded-md transition-all truncate px-2 min-w-[60px]", activeTab === 'all' ? "bg-slate-200 text-slate-900 shadow" : "text-slate-400 hover:text-white")}>
                            🌍 TOUT ({conversations.length})
                        </button>
                        <button onClick={() => setActiveTab('action')} className={cn("flex-1 text-[9px] font-bold py-1.5 rounded-md transition-all truncate px-2 min-w-[60px]", activeTab === 'action' ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white")}>
                            🔴 ACTION ({conversations.filter(c => (c.status === 'escalated' || c.status === 'assigned') && !c.category_id).length})
                        </button>
                        <button onClick={() => setActiveTab('ai')} className={cn("flex-1 text-[9px] font-bold py-1.5 rounded-md transition-all truncate px-2 min-w-[60px]", activeTab === 'ai' ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white")}>
                            🤖 IA ({conversations.filter(c => c.status === 'ai_active' && !c.category_id).length})
                        </button>
                        {categories.filter(cat => !['Action Requise', 'IA en cours', 'Clos'].includes(cat.name)).map(cat => (
                           <div key={cat.id} className="relative group/cat">
                               <button 
                                    onClick={() => setActiveTab(cat.id)} 
                                    className={cn("w-full text-[9px] font-bold py-1.5 rounded-md transition-all truncate px-2 min-w-[80px]", activeTab === cat.id ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-white")}
                                    onContextMenu={(e) => { e.preventDefault(); setEditingCatId(cat.id); setNewCatName(cat.name); setNewCatColor(cat.color); }}
                                >
                                    {cat.name.toUpperCase()} ({conversations.filter(c => c.category_id === cat.id).length})
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); deleteCategory(cat.id); }}
                                    className="absolute -top-1 -right-1 opacity-0 group-hover/cat:opacity-100 bg-red-600 text-white rounded-full w-3 h-3 flex items-center justify-center text-[8px] hover:scale-110 transition-all z-10"
                                >
                                    ×
                                </button>
                           </div>
                        ))}
                        {/* Bouton Ajouter Catégorie */}
                        <button 
                            onClick={() => setShowNewCatForm(!showNewCatForm)}
                            className="px-2 py-1.5 text-slate-500 hover:text-emerald-400 transition-colors border-l border-slate-700/50"
                        >
                            +
                        </button>
                    </div>

                    {showNewCatForm && (
                        <div className="mt-2 p-3 bg-slate-900 border border-slate-700 rounded-lg animate-fadeIn shadow-2xl z-20">
                            <input 
                                value={newCatName} 
                                onChange={e => setNewCatName(e.target.value)}
                                placeholder="Nom de la catégorie..."
                                className="w-full bg-slate-800 border-none text-[11px] text-white px-2 py-1.5 rounded mb-2"
                            />
                            <div className="flex items-center justify-between">
                                <input 
                                    type="color" 
                                    value={newCatColor} 
                                    onChange={e => setNewCatColor(e.target.value)}
                                    className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setShowNewCatForm(false)} className="text-[10px] text-slate-500 hover:text-white">Annuler</button>
                                    <button onClick={createCategory} className="text-[10px] text-emerald-500 font-bold hover:text-emerald-400">Créer</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {editingCatId && (
                        <div className="mt-2 p-3 bg-slate-900 border border-blue-500/50 rounded-lg animate-fadeIn shadow-2xl z-20">
                            <p className="text-[9px] text-blue-400 font-bold mb-2 uppercase tracking-widest">Modifier Catégorie</p>
                            <input 
                                value={newCatName} 
                                onChange={e => setNewCatName(e.target.value)}
                                className="w-full bg-slate-800 border-none text-[11px] text-white px-2 py-1.5 rounded mb-2"
                            />
                            <div className="flex items-center justify-between">
                                <input 
                                    type="color" 
                                    value={newCatColor} 
                                    onChange={e => setNewCatColor(e.target.value)}
                                    className="w-8 h-8 rounded border-none bg-transparent cursor-pointer"
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setEditingCatId(null)} className="text-[10px] text-slate-500 hover:text-white">Annuler</button>
                                    <button onClick={() => updateCategory(editingCatId, newCatName, newCatColor)} className="text-[10px] text-blue-500 font-bold hover:text-blue-400">Enregistrer</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filtered.length === 0 && (
                        <div className="p-8 text-center text-slate-500 text-sm">Aucune conversation</div>
                    )}
                    {filtered.map(conv => {
                        const pp = conv.Profil_Prospects
                        const name = pp?.prenom ? `${pp.prenom} ${pp.nom ?? ''}`.trim() : conv.contact_chat_id
                        const isActive = selected?.id === conv.id
                        return (
                            <button key={conv.id} onClick={() => selectConversation(conv)}
                                className={cn(
                                    'w-full text-left px-4 py-3 border-b transition-colors',
                                    isActive ? 'bg-blue-500/10' : 'hover:bg-white/3'
                                )}
                                style={{ borderColor: 'rgba(30, 58, 95, 0.4)' }}>
                                <div className="flex items-start gap-3">
                                    <div className="relative flex-shrink-0">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600
                      flex items-center justify-center text-sm font-bold text-white">
                                            {getInitials(pp?.prenom ?? undefined, pp?.nom ?? undefined)}
                                        </div>
                                        <span className={cn('absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0f1e]',
                                            statusColors[conv.status] ?? 'bg-slate-500')} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-medium text-white truncate">{name}</span>
                                                {(pp?.score_engagement ?? 0) >= 80 ? (
                                                    <span title="Lead Chaud" className="text-xs">🔥</span>
                                                ) : (pp?.score_engagement ?? 0) < 30 ? (
                                                    <span title="Lead Froid" className="text-xs">❄️</span>
                                                ) : null}
                                            </div>
                                            <span className="text-[10px] text-slate-500 flex-shrink-0">
                                                {formatRelativeDate(conv.last_message_at)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 truncate mt-0.5">
                                            {truncate(conv.last_message_preview ?? '', 40)}
                                        </p>
                                        <div className="flex items-center justify-between mt-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{pp?.profil_type ?? 'Prospect'}</span>
                                                {conv.Inbox_Categories && (
                                                    <span className="text-[8px] font-black px-1 rounded border opacity-70"
                                                        style={{ color: conv.Inbox_Categories.color, borderColor: conv.Inbox_Categories.color }}>
                                                        {conv.Inbox_Categories.name}
                                                    </span>
                                                )}
                                            </div>
                                            {conv.unread_count > 0 && (
                                                <span className="bg-blue-500 text-white text-xs rounded-full w-4 h-4
                          flex items-center justify-center font-bold">
                                                    {conv.unread_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* ── Zone messages (2ème Colonne Centrale) ─────────────── */}
            {selected ? (
                <>
                    <div className={cn("flex-1 flex flex-col min-w-0 border-r transition-all duration-300", isZenMode ? "fixed inset-0 z-50 bg-[#0a0f1e]" : "relative")} style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                        {/* Header contact */}
                        <div className="px-6 py-4 border-b flex items-center justify-between bg-[#0a0f1f]/80 backdrop-blur-md sticky top-0 z-10"
                            style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600
                flex items-center justify-center text-sm font-bold text-white shadow-lg">
                                    {getInitials(
                                        selected.Profil_Prospects?.prenom ?? undefined,
                                        selected.Profil_Prospects?.nom ?? undefined
                                    )}
                                </div>
                                <div>
                                    <p className="font-bold text-white flex items-center gap-2">
                                        {selected.Profil_Prospects?.prenom
                                            ? `${selected.Profil_Prospects.prenom} ${selected.Profil_Prospects.nom ?? ''}`.trim()
                                            : selected.contact_chat_id}
                                        {isZenMode && <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold animate-pulse">MODE ZEN</span>}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] text-slate-400 font-mono">{selected.contact_chat_id}</p>
                                        <span className="text-slate-700">•</span>
                                        <select 
                                            value={selected.category_id || ''} 
                                            onChange={(e) => changeCategory(selected.id, e.target.value || null)}
                                            disabled={isChangingCategory === selected.id}
                                            className="bg-transparent text-[10px] font-bold text-blue-400 border-none p-0 cursor-pointer focus:ring-0 hover:text-blue-300"
                                        >
                                            <option value="" className="bg-slate-900">Sans catégorie</option>
                                            {categories.map(cat => (
                                                <option key={cat.id} value={cat.id} className="bg-slate-900">{cat.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setIsZenMode(!isZenMode)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400 hover:text-white" title="Mode Zen">
                                    {isZenMode ? '📐' : '🧿'}
                                </button>
                                <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
                                    {selected.status !== 'ai_active' && selected.status !== 'resolved' && (
                                        <button
                                            onClick={handoverToAI}
                                            disabled={handingOver}
                                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-[10px] hover:bg-emerald-500 transition-all font-black flex items-center gap-1.5 shadow-lg shadow-emerald-900/20"
                                        >
                                            {handingOver ? '...' : '🤖 IA ACTIVATE'}
                                        </button>
                                    )}
                                    {selected.status === 'ai_active' && (
                                        <button
                                            onClick={takeoverFromAI}
                                            disabled={handingOver}
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-[10px] hover:bg-red-500 transition-all font-black flex items-center gap-1.5 shadow-lg shadow-red-900/20 animate-pulse"
                                        >
                                            {handingOver ? '...' : '🛑 TAKE OVER'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Bandeau d'Avertissement Takeover */}
                        {(selected.status === 'assigned' || selected.status === 'escalated') && (
                            <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-3">
                                <span className="text-amber-500">⚠️</span>
                                <p className="text-xs text-amber-500 font-medium">
                                    L'IA est actuellement en pause sur cette conversation. Le prospect attend une intervention humaine.
                                </p>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {messages.map(msg => {
                                const isOut = msg.direction === 'outbound'
                                return (
                                    <div key={msg.id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                                        <div className={cn(
                                            'max-w-[70%] px-4 py-3 text-sm animate-fadeIn',
                                            isOut ? 'msg-bubble-out text-blue-100' : 'msg-bubble-in text-slate-200'
                                        )}>
                                            {msg.message_type !== 'text' ? (
                                                <span className="italic text-slate-400">
                                                    [{msg.message_type === 'audio' ? '🎤 Audio' :
                                                        msg.message_type === 'image' ? '🖼️ Image' :
                                                            msg.message_type === 'video' ? '🎥 Vidéo' :
                                                                '📎 Fichier'}] → Pris en charge par un conseiller
                                                </span>
                                            ) : (
                                                <p className="whitespace-pre-wrap">{msg.body}</p>
                                            )}
                                            <div className="flex items-center justify-between mt-1.5 gap-2">
                                                <span className="text-xs text-slate-500">{formatTime(msg.timestamp)}</span>
                                                {isOut && (
                                                    <span className="text-xs text-slate-500">
                                                        {msg.is_ai_response ? '🤖' : '👤'}
                                                        {msg.delivery_status === 'read' ? ' ✓✓' :
                                                            msg.delivery_status === 'delivered' ? ' ✓' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Zone de réponse */}
                        <div className="p-4 border-t" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                            <div className="flex gap-3">
                                <textarea
                                    value={replyText}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                                    placeholder="Répondre en tant qu'admin (Entrée pour envoyer)..."
                                    rows={2}
                                    className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500
                  focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                    style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                                />
                                <button onClick={sendReply} disabled={sending || !replyText.trim()}
                                    className="btn-primary px-4 self-end flex items-center gap-2 font-bold">
                                    {sending ? '...' : '→ Envoyer'}
                                </button>
                            </div>

                            {/* Quick Replies Humaines */}
                            {(selected.status === 'assigned' || selected.status === 'escalated') && (
                                <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    <button onClick={() => setReplyText("Bonjour ! Je prends le relais de l'assistant virtuel. Comment puis-je vous aider ?")}
                                        className="whitespace-nowrap px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700/50 transition-colors">
                                        👋 Prendre le relais
                                    </button>
                                    <button onClick={() => setReplyText("Voici le lien pour finaliser votre inscription : ")}
                                        className="whitespace-nowrap px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700/50 transition-colors">
                                        🔗 Lien d'inscription
                                    </button>
                                    <button onClick={() => setReplyText("Avez-vous d'autres questions avant de valider votre place ?")}
                                        className="whitespace-nowrap px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700/50 transition-colors">
                                        ❓ Autres questions
                                    </button>
                                </div>
                            )}

                            <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-wider font-bold">
                                💡 En répondant manuellement, vous prenez le contrôle de la conversation (l'IA se tait).
                            </p>
                        </div>
                    </div>

                    {/* ── Panneau Prospect (3ème Colonne) ──────────────────── */}
                    <div className="w-80 flex flex-col flex-shrink-0 overflow-y-auto animate-fadeIn" style={{ background: 'rgba(10, 15, 30, 0.4)' }}>
                        <div className="p-5 border-b" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                            <h2 className="font-bold text-white">Profil IA du Prospect</h2>
                            <p className="text-xs text-slate-400">Données extraites automatiquement</p>
                        </div>

                        <div className="p-5 space-y-6">
                            {/* Score global (Jauge) */}
                            <div className="text-center p-4 rounded-2xl glass-card relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1"
                                    style={{ background: `linear-gradient(90deg, #34d399 ${(selected.Profil_Prospects?.score_engagement ?? 0)}%, transparent 0)` }} />
                                <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-full mb-3 mt-2"
                                    style={{ background: `conic-gradient(#34d399 ${(selected.Profil_Prospects?.score_engagement ?? 0)}%, rgba(30,58,95,0.3) 0)` }}>
                                    <div className="absolute inset-1.5 rounded-full flex flex-col items-center justify-center" style={{ background: '#0a0f1e' }}>
                                        <span className="text-2xl font-black text-white leading-none">{selected.Profil_Prospects?.score_engagement ?? 0}</span>
                                        <span className="text-[9px] text-slate-400 mt-1">SCORE</span>
                                    </div>
                                </div>
                                <p className="text-sm font-bold text-emerald-400">
                                    {(selected.Profil_Prospects?.score_engagement ?? 0) >= 80 ? '🔥 Lead Très Chaud' :
                                        (selected.Profil_Prospects?.score_engagement ?? 0) >= 50 ? '⭐ Intéressé' : '❄️ Froid'}
                                </p>
                            </div>

                            {/* Informations clés */}
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Statut Pipeline</p>
                                    <span className="inline-block px-2 py-1 text-xs font-semibold rounded-md"
                                        style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        {selected.Profil_Prospects?.statut_conversation ?? 'Nouveau'}
                                    </span>
                                </div>

                                <div className="h-px w-full" style={{ background: 'rgba(30, 58, 95, 0.4)' }} />

                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Nom Complet</p>
                                    <p className="text-sm text-white font-medium">
                                        {selected.Profil_Prospects?.prenom ? `${selected.Profil_Prospects.prenom} ${selected.Profil_Prospects.nom ?? ''}`.trim() : 'Non détecté'}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs text-slate-500 mb-1">Type de Profil</p>
                                    <p className="text-sm text-slate-300">{selected.Profil_Prospects?.profil_type ?? 'Non détecté'}</p>
                                </div>

                                <div className="h-px w-full" style={{ background: 'rgba(30, 58, 95, 0.4)' }} />

                                <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20">
                                    <p className="text-xs text-blue-300 mb-1">💡 Prochaine Action Conseillée</p>
                                    <p className="text-xs text-slate-300 leading-relaxed">
                                        {(selected.Profil_Prospects?.score_engagement ?? 0) >= 80
                                            ? "Ce prospect est chaud. Proposez-lui un appel ou l'envoi du formulaire d'inscription immédiatement."
                                            : "Laissez l'IA qualifier ce prospect jusqu'à ce que son score d'engagement atteigne 80."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <div className="text-6xl mb-4">💬</div>
                        <p className="text-slate-400">Sélectionnez une conversation</p>
                    </div>
                </div>
            )}
        </div>
    )
}
