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
    const [handingOver, setHandingOver] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // Charger conversations
    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from('conversations')
                .select(`id, contact_chat_id, status, last_message_preview, last_message_at, unread_count,
          Profil_Prospects(prenom, nom, profil_type, score_engagement, statut_conversation)`)
                .order('last_message_at', { ascending: false })
                .limit(50)
            setConversations((data as any) ?? [])
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

    const filtered = conversations.filter(c => {
        const name = `${c.Profil_Prospects?.prenom ?? ''} ${c.Profil_Prospects?.nom ?? ''} ${c.contact_chat_id}`.toLowerCase()
        return name.includes(searchQuery.toLowerCase())
    })

    const statusColors: Record<string, string> = {
        ai_active: 'bg-emerald-500',
        escalated: 'bg-amber-500',
        assigned: 'bg-blue-500',
        resolved: 'bg-slate-500',
    }

    return (
        <div className="flex h-screen">
            {/* ── Panneau conversations ─────────────────────────────── */}
            <div className="w-80 flex flex-col border-r" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                <div className="p-4 border-b" style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                    <h1 className="text-lg font-bold text-white mb-3">Inbox</h1>
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Rechercher..."
                        className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(30, 58, 95, 0.8)' }}
                    />
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
                                            <span className="text-sm font-medium text-white truncate">{name}</span>
                                            <span className="text-xs text-slate-500 flex-shrink-0">
                                                {formatRelativeDate(conv.last_message_at)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 truncate mt-0.5">
                                            {truncate(conv.last_message_preview ?? '', 40)}
                                        </p>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-xs text-slate-600">{pp?.profil_type ?? ''}</span>
                                            {conv.unread_count > 0 && (
                                                <span className="bg-blue-500 text-white text-xs rounded-full w-5 h-5
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

            {/* ── Zone messages ─────────────────────────────────────── */}
            {selected ? (
                <div className="flex-1 flex flex-col">
                    {/* Header contact */}
                    <div className="px-6 py-4 border-b flex items-center justify-between"
                        style={{ borderColor: 'rgba(30, 58, 95, 0.6)' }}>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600
                flex items-center justify-center text-sm font-bold text-white">
                                {getInitials(
                                    selected.Profil_Prospects?.prenom ?? undefined,
                                    selected.Profil_Prospects?.nom ?? undefined
                                )}
                            </div>
                            <div>
                                <p className="font-semibold text-white">
                                    {selected.Profil_Prospects?.prenom
                                        ? `${selected.Profil_Prospects.prenom} ${selected.Profil_Prospects.nom ?? ''}`.trim()
                                        : selected.contact_chat_id}
                                </p>
                                <p className="text-xs text-slate-400">{selected.contact_chat_id}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-400">Score:</span>
                            <span className="text-sm font-bold text-emerald-400">
                                {selected.Profil_Prospects?.score_engagement ?? 0}/100
                            </span>
                            <span className="badge ml-2" style={{ background: 'rgba(59,130,246,0.1)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.2)' }}>
                                {selected.status?.replace('_', ' ')}
                            </span>
                            {selected.status !== 'ai_active' && (
                                <button
                                    onClick={handoverToAI}
                                    disabled={handingOver}
                                    className="ml-4 px-3 py-1 bg-purple-600/20 text-purple-400 border border-purple-500/30 rounded-full text-xs hover:bg-purple-600/30 transition-colors"
                                >
                                    {handingOver ? '...Activation...' : '🤖 Rendre à l\'IA'}
                                </button>
                            )}
                        </div>
                    </div>

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
                                className="btn-primary px-4 self-end flex items-center gap-2">
                                {sending ? '...' : '→ Envoyer'}
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">
                            💡 En répondant manuellement, vous prenez le contrôle de la conversation (l'IA se tait).
                        </p>
                    </div>
                </div>
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
