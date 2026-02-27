# 11 — Frontend : Pages & Composants
## BloLab Dashboard CRM WhatsApp IA

---

## Architecture UI Globale

```
app/(dashboard)/
├── page.tsx              → Home — KPIs résumés + badge session
├── inbox/page.tsx        → 3 colonnes (conversations | chat | contact)
├── contacts/
│   ├── page.tsx          → CDP — Liste + filtres + recherche sémantique
│   └── [id]/page.tsx     → Fiche contact détaillée
├── ai-agent/page.tsx     → Base de connaissances + Playground RAG
├── broadcast/page.tsx    → Campagnes + Scheduling + Rapports
├── analytics/page.tsx    → Graphiques Recharts
└── settings/
    └── whatsapp/page.tsx → QR Code reconnexion
```

---

## Layout Dashboard : `app/(dashboard)/layout.tsx`

```typescript
import { SessionBadge } from '@/components/dashboard/SessionBadge'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header avec badge session */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-gray-900">
          <h1 className="text-sm font-semibold text-gray-400">BloLab CRM</h1>
          <SessionBadge />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
```

---

## Sidebar : `components/dashboard/Sidebar.tsx`

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare, Users, Bot, Megaphone,
  BarChart3, Settings, Wifi
} from 'lucide-react'

const NAV = [
  { href: '/',           icon: BarChart3,    label: 'Dashboard' },
  { href: '/inbox',      icon: MessageSquare,label: 'Inbox' },
  { href: '/contacts',   icon: Users,        label: 'Contacts' },
  { href: '/ai-agent',   icon: Bot,          label: 'Agent IA' },
  { href: '/broadcast',  icon: Megaphone,    label: 'Broadcast' },
  { href: '/analytics',  icon: BarChart3,    label: 'Analytics' },
  { href: '/settings/whatsapp', icon: Wifi,  label: 'WhatsApp' },
]

export function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col py-4">
      <div className="px-4 mb-6">
        <span className="text-lg font-bold text-green-400">BloLab</span>
        <span className="text-xs text-gray-500 ml-1">CRM IA</span>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
              ${path === href
                ? 'bg-green-500/20 text-green-400 font-medium'
                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
```

---

## Page Inbox : `app/(dashboard)/inbox/page.tsx`

```typescript
'use client'
import { useState, useEffect } from 'react'
import { ConversationList } from '@/components/inbox/ConversationList'
import { ChatWindow } from '@/components/inbox/ChatWindow'
import { ContactPanel } from '@/components/inbox/ContactPanel'
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages'

export default function InboxPage() {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<any[]>([])
  const { newMessages } = useRealtimeMessages()

  useEffect(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then(setConversations)
  }, [newMessages])  // Refresh quand nouveau message Realtime

  return (
    <div className="flex h-full">
      {/* Colonne 1 — Liste conversations */}
      <div className="w-80 border-r border-gray-800 flex flex-col">
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
        />
      </div>

      {/* Colonne 2 — Fenêtre de chat */}
      <div className="flex-1 flex flex-col">
        {selectedConvId
          ? <ChatWindow conversationId={selectedConvId} />
          : (
            <div className="flex-1 flex items-center justify-center text-gray-600">
              <p>Sélectionnez une conversation</p>
            </div>
          )
        }
      </div>

      {/* Colonne 3 — Infos contact */}
      {selectedConvId && (
        <div className="w-72 border-l border-gray-800">
          <ContactPanel conversationId={selectedConvId} />
        </div>
      )}
    </div>
  )
}
```

---

## ConversationList : `components/inbox/ConversationList.tsx`

```typescript
'use client'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Bot, User, Clock, Volume2 } from 'lucide-react'

const STATUS_CONFIG = {
  ai_active:       { icon: Bot,    color: 'text-green-400',  label: 'IA active' },
  escalated:       { icon: Clock,  color: 'text-amber-400',  label: 'En attente' },
  assigned:        { icon: User,   color: 'text-blue-400',   label: 'Assigné' },
  resolved:        { icon: User,   color: 'text-gray-500',   label: 'Résolu' },
  vocal_pending:   { icon: Volume2,color: 'text-red-400',    label: 'Vocal en attente' },
  muted_temp:      { icon: Bot,    color: 'text-gray-400',   label: 'IA silencieuse' },
  muted_permanent: { icon: Bot,    color: 'text-gray-500',   label: 'IA désactivée' },
}

export function ConversationList({ conversations, selectedId, onSelect }: any) {
  return (
    <div className="flex flex-col">
      {/* Filtres rapides */}
      <div className="flex gap-1 p-2 border-b border-gray-800">
        {['Tous', 'IA', 'Escalade', 'Vocal'].map(f => (
          <button key={f} className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-300 hover:bg-gray-700">
            {f}
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="overflow-y-auto flex-1">
        {conversations.map((conv: any) => {
          const cfg = STATUS_CONFIG[conv.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.ai_active
          const Icon = cfg.icon
          return (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left p-3 border-b border-gray-800 hover:bg-gray-800/50 transition
                ${selectedId === conv.id ? 'bg-green-500/10 border-l-2 border-l-green-500' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-sm text-gray-100 truncate">
                  {conv.contacts?.prenom ?? conv.contacts?.whatsapp_number}
                </span>
                <span className="text-xs text-gray-500">
                  {conv.last_message_at
                    ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: fr })
                    : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3 h-3 ${cfg.color}`} />
                <span className="text-xs text-gray-500 truncate flex-1">
                  {conv.last_message_preview ?? '…'}
                </span>
                {conv.unread_count > 0 && (
                  <span className="bg-green-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {conv.unread_count}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

---

## ChatWindow : `components/inbox/ChatWindow.tsx`

```typescript
'use client'
import { useState, useEffect, useRef } from 'react'
import { AudioMessageBubble } from './AudioMessageBubble'
import { Send, UserCheck, BotOff } from 'lucide-react'

export function ChatWindow({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<any[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [conv, setConv] = useState<any>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/conversations/${conversationId}`)
      .then(r => r.json())
      .then(data => { setConv(data.conversation); setMessages(data.messages) })
  }, [conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleTakeover() {
    await fetch(`/api/conversations/${conversationId}/takeover`, {
      method: 'POST',
      body: JSON.stringify({ sendTransitionMessage: true }),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  async function sendReply() {
    if (!reply.trim()) return
    setSending(true)
    const phone = conv?.contacts?.whatsapp_number
    await fetch(`/api/wasender/send`, {
      method: 'POST',
      body: JSON.stringify({ to: phone, text: reply, conversationId }),
      headers: { 'Content-Type': 'application/json' },
    })
    setReply('')
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header conversation */}
      <div className="flex items-center justify-between p-3 border-b border-gray-800">
        <div>
          <p className="font-semibold">{conv?.contacts?.prenom ?? conv?.contacts?.whatsapp_number}</p>
          <p className="text-xs text-gray-500">Statut : {conv?.status}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTakeover}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Prendre le contrôle
          </button>
        </div>
      </div>

      {/* Fil de messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg: any) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.message_type === 'audio'
              ? <AudioMessageBubble message={msg} />
              : (
                <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm
                  ${msg.direction === 'outbound'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-100'
                  } ${msg.is_ai_response ? 'border border-green-500/30' : ''}`}
                >
                  {msg.is_ai_response && (
                    <span className="block text-xs text-green-300 mb-1">🤖 IA</span>
                  )}
                  {msg.body}
                </div>
              )
            }
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Zone de réponse admin */}
      {conv?.status === 'assigned' && (
        <div className="flex gap-2 p-3 border-t border-gray-800">
          <input
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendReply()}
            placeholder="Répondre en tant qu'admin…"
            className="flex-1 bg-gray-800 text-gray-100 px-4 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={sendReply}
            disabled={sending || !reply.trim()}
            className="p-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-lg"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      )}
    </div>
  )
}
```

---

## Hook Realtime : `hooks/useRealtimeMessages.ts`

```typescript
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useRealtimeMessages() {
  const [newMessages, setNewMessages] = useState<any[]>([])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        setNewMessages(prev => [...prev, payload.new])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { newMessages }
}
```

---

## Page Analytics : `app/(dashboard)/analytics/page.tsx`

```typescript
'use client'
import { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(setData)
  }, [])

  if (!data) return <div className="p-8 text-gray-500">Chargement…</div>

  const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6366f1']

  const kpis = [
    { label: 'Messages reçus',     value: data.messages.inbound },
    { label: 'Réponses IA',        value: data.ai.responses },
    { label: 'Taux résolution IA', value: `${data.ai.resolutionRate}%` },
    { label: 'Taux escalade',      value: `${data.ai.escalationRate}%` },
    { label: 'Nouveaux contacts',  value: data.contacts.new },
    { label: 'Succès transcription',value: `${data.vocal.successRate}%` },
  ]

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">Analytics — 30 derniers jours</h2>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {kpis.map(kpi => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
            <p className="text-2xl font-bold text-green-400">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Graphique Pie — Statuts conversations */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">Résolution IA vs Escalade</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={[
                { name: 'Répondu par IA', value: data.ai.responses },
                { name: 'Escalade humaine', value: data.ai.escalations },
              ]}
              cx="50%" cy="50%" outerRadius={80} dataKey="value"
            >
              {[0, 1].map(i => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

---

## Page AI Agent : `app/(dashboard)/ai-agent/page.tsx`

```typescript
'use client'
import { useState, useEffect } from 'react'
import { Search, Plus, Trash2, RefreshCw } from 'lucide-react'

export default function AIAgentPage() {
  const [chunks, setChunks] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [newContent, setNewContent] = useState('')
  const [scraping, setScraping] = useState(false)
  const [lastJob, setLastJob] = useState<any>(null)

  useEffect(() => {
    fetch('/api/knowledge/chunks').then(r => r.json()).then(setChunks)
    fetch('/api/knowledge/scrape?history=1').then(r => r.json()).then(setLastJob)
  }, [])

  async function triggerScrape() {
    setScraping(true)
    await fetch('/api/knowledge/scrape', { method: 'POST' })
    setTimeout(() => setScraping(false), 3000)
  }

  async function testRAG() {
    const res = await fetch('/api/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
      headers: { 'Content-Type': 'application/json' },
    })
    const data = await res.json()
    setResults(data.chunks ?? [])
  }

  async function addChunk() {
    await fetch('/api/knowledge/chunks', {
      method: 'POST',
      body: JSON.stringify({ content: newContent }),
      headers: { 'Content-Type': 'application/json' },
    })
    setNewContent('')
    fetch('/api/knowledge/chunks').then(r => r.json()).then(setChunks)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Agent IA — Base de Connaissances</h2>
        <button
          onClick={triggerScrape}
          disabled={scraping}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${scraping ? 'animate-spin' : ''}`} />
          {scraping ? 'Scraping en cours…' : 'Actualiser blolab.bj'}
        </button>
      </div>

      {lastJob && (
        <p className="text-xs text-gray-500">
          Dernière mise à jour : {new Date(lastJob.completed_at).toLocaleString('fr-FR')} —
          {lastJob.chunks_created} chunks · {lastJob.pages_scraped} pages
        </p>
      )}

      {/* Playground RAG */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">🔬 Playground — Tester le RAG</h3>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Simule une question (ex: formations disponibles)"
            className="flex-1 bg-gray-800 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none"
          />
          <button
            onClick={testRAG}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
        {results.map((r: any, i: number) => (
          <div key={i} className="bg-gray-800 p-3 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-indigo-400 text-xs font-medium">{r.section}</span>
              <span className="text-green-400 text-xs">{Math.round(r.similarity * 100)}% similarité</span>
            </div>
            <p className="text-gray-300 text-xs">{r.content.slice(0, 200)}…</p>
          </div>
        ))}
      </div>

      {/* Ajout manuel */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">✍️ Ajouter une connaissance manuelle</h3>
        <textarea
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          placeholder="Ex: ClassTech est notre programme phare pour les jeunes de 8 à 17 ans…"
          className="w-full bg-gray-800 text-gray-100 px-3 py-2 rounded-lg text-sm focus:outline-none h-24 resize-none"
        />
        <button
          onClick={addChunk}
          disabled={!newContent.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>

      {/* Liste chunks manuels */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Connaissances manuelles ({chunks.filter((c:any) => c.is_manual).length})</h3>
        {chunks.filter((c:any) => c.is_manual).map((c:any) => (
          <div key={c.id} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg p-3">
            <p className="flex-1 text-sm text-gray-300">{c.content.slice(0, 150)}…</p>
            <button
              onClick={async () => {
                await fetch('/api/knowledge/chunks', {
                  method: 'DELETE',
                  body: JSON.stringify({ id: c.id }),
                  headers: { 'Content-Type': 'application/json' },
                })
                setChunks(chunks.filter((x:any) => x.id !== c.id))
              }}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

*Section 11 complète — Dernière étape : fusion finale `SPEC_TECHNIQUE_COMPLETE.md`*
