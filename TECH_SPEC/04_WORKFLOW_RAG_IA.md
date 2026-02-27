# 04 — Workflow 2 : Pipeline RAG — Réponse IA & Profilage Silencieux
## BloLab Dashboard CRM WhatsApp IA

---

## Vue d'ensemble

Ce pipeline transforme un message texte entrant en une réponse IA naturelle, tout en enrichissant silencieusement le profil prospect en base de données.

```
Message texte reçu (depuis Workflow 03)
    │
    ▼
[1] Embedding du message (Gemini Embedding 001)
    │
    ▼
[2] Recherche vectorielle pgvector (search_knowledge)
    │
    ├── Score < seuil (0.75) → Escalade humaine
    │
    ▼
[3] Récupération historique conversation (PostgreSQL)
    │
    ▼
[4] Construction du prompt complet
    │   [System Prompt BloLab] + [Historique] + [Contexte RAG] + [Message]
    │
    ▼
[5] Appel LLM (Gemini 2.0 Flash / GPT-4o-mini fallback)
    │
    ▼
[6] Profilage silencieux : extraction données → UPDATE contacts
    │
    ▼
[7] Détection score lead → Alerte Telegram si ≥ 8
    │
    ▼
[8] Envoi réponse via WaSenderAPI
    │
    ▼
[9] Log async (ai_logs) + Push Supabase Realtime
```

---

## Code Complet : `lib/ai/rag-pipeline.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { extractLeadProfile } from '@/lib/ai/lead-profiler'
import { sendTelegramAlert } from '@/lib/notifications/telegram'
import { BLOLAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

export interface RAGInput {
  from: string
  text: string
  contactId: string
  conversationId: string
}

export async function triggerAIResponse(input: RAGInput): Promise<void> {
  const { from, text, contactId, conversationId } = input
  const startTime = Date.now()
  const supabase = createClient()

  // ─── [1] EMBEDDING DU MESSAGE ───────────────────────────────────
  const embeddingModel = genAI.getGenerativeModel({
    model: 'models/gemini-embedding-001'
  })

  const embeddingResult = await embeddingModel.embedContent(text)
  const queryEmbedding = embeddingResult.embedding.values

  // ─── [2] RECHERCHE VECTORIELLE ──────────────────────────────────
  const similarityThreshold = 0.75
  const { data: chunks } = await supabase.rpc('search_knowledge', {
    query_embedding: queryEmbedding,
    similarity_threshold: similarityThreshold,
    match_count: 5,
  })

  // Pas assez de contexte → escalade
  if (!chunks || chunks.length === 0) {
    await handleNoContextEscalation(from, conversationId, supabase)
    return
  }

  // ─── [3] HISTORIQUE DE CONVERSATION ────────────────────────────
  const { data: history } = await supabase
    .from('messages')
    .select('direction, body, timestamp, is_ai_response')
    .eq('conversation_id', conversationId)
    .eq('message_type', 'text')
    .order('timestamp', { ascending: false })
    .limit(10)  // 10 derniers messages pour le contexte

  const historyFormatted = (history ?? [])
    .reverse()
    .map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'model',
      parts: [{ text: m.body ?? '' }],
    }))

  // ─── [4] RÉCUPÉRATION PROFIL CONTACT ───────────────────────────
  const { data: contact } = await supabase
    .from('contacts')
    .select('prenom, profil_type, centre_interet, statut_lead, notes')
    .eq('id', contactId)
    .single()

  // ─── [5] CONSTRUCTION DU PROMPT ────────────────────────────────
  const ragContext = chunks
    .map((c: any) => `### Source: ${c.section}\n${c.content}`)
    .join('\n\n')

  const contactContext = contact?.prenom
    ? `\n## Profil connu de ce contact\nPrénom: ${contact.prenom}` +
      (contact.profil_type ? ` | Type: ${contact.profil_type}` : '') +
      (contact.centre_interet ? ` | Intérêt: ${contact.centre_interet}` : '')
    : ''

  const fullSystemPrompt =
    BLOLAB_SYSTEM_PROMPT +
    contactContext +
    `\n\n## Informations BloLab pertinentes (base de connaissances)\n${ragContext}`

  // ─── [6] APPEL LLM ─────────────────────────────────────────────
  let aiResponse = ''
  let modelUsed = 'gemini-2.0-flash'

  try {
    const chatModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: fullSystemPrompt,
    })

    const chat = chatModel.startChat({ history: historyFormatted })
    const result = await chat.sendMessage(text)
    aiResponse = result.response.text()

  } catch (geminiError) {
    // Fallback vers GPT-4o-mini si Gemini échoue
    console.warn('[RAG] Gemini échoué, fallback GPT-4o-mini:', geminiError)
    aiResponse = await fallbackOpenAI(fullSystemPrompt, historyFormatted, text)
    modelUsed = 'gpt-4o-mini'
  }

  // ─── [7] PROFILAGE SILENCIEUX ───────────────────────────────────
  const profileUpdate = await extractLeadProfile(text, aiResponse, contact)
  if (Object.keys(profileUpdate).length > 0) {
    await supabase
      .from('contacts')
      .update({
        ...profileUpdate,
        last_contact_at: new Date().toISOString(),
      })
      .eq('id', contactId)
  }

  // ─── [8] ALERTE TELEGRAM SI LEAD CHAUD ─────────────────────────
  if (profileUpdate.score_lead && profileUpdate.score_lead >= 8) {
    await sendTelegramAlert(
      `🔥 *LEAD CHAUD*\n` +
      `Prénom: ${profileUpdate.prenom ?? contact?.prenom ?? 'Inconnu'}\n` +
      `Profil: ${profileUpdate.profil_type ?? contact?.profil_type ?? '-'}\n` +
      `Programme: ${profileUpdate.programme_recommande ?? '-'}\n` +
      `Score: ${profileUpdate.score_lead}/10\n` +
      `Tél: ${from}`
    )
  }

  // ─── [9] ENVOI RÉPONSE ──────────────────────────────────────────
  await sendWhatsAppMessage(from, aiResponse)

  // Enregistrer la réponse IA en base
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    contact_id: contactId,
    direction: 'outbound',
    message_type: 'text',
    body: aiResponse,
    is_ai_response: true,
  })

  // ─── [10] LOG ASYNC ─────────────────────────────────────────────
  const processingTime = Date.now() - startTime
  await supabase.from('ai_logs').insert({
    conversation_id: conversationId,
    contact_id: contactId,
    user_message: text,
    message_type: 'text',
    chunks_retrieved: chunks,
    similarity_threshold: similarityThreshold,
    system_prompt: fullSystemPrompt,
    llm_response: aiResponse,
    llm_model: modelUsed,
    processing_time_ms: processingTime,
    was_escalated: false,
  })
}

async function handleNoContextEscalation(
  from: string,
  conversationId: string,
  supabase: ReturnType<typeof createClient>
) {
  await sendWhatsAppMessage(from,
    `Je ne dispose pas de cette information pour le moment. ` +
    `Je transmets votre demande à l'équipe BloLab qui vous ` +
    `répondra très bientôt.`
  )
  await supabase
    .from('conversations')
    .update({ status: 'escalated' })
    .eq('id', conversationId)
}

async function fallbackOpenAI(
  systemPrompt: string,
  history: any[],
  userMessage: string
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h: any) => ({
      role: h.role === 'model' ? 'assistant' : 'user',
      content: h.parts[0].text,
    })),
    { role: 'user', content: userMessage },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  })

  const data = await res.json()
  return data.choices[0].message.content
}
```

---

## Prompt Système : `lib/ai/prompts.ts`

```typescript
export const BLOLAB_SYSTEM_PROMPT = `
═══════════════════════════════════════════════════════════════════
RÈGLES ABSOLUES DE FORMATAGE
═══════════════════════════════════════════════════════════════════

🚫 INTERDICTIONS :
- JAMAIS retourner de données JSON ou métadonnées techniques
- JAMAIS dire "j'enregistre" ou "je mets à jour ta fiche"
- JAMAIS mentionner les outils utilisés en interne
- JAMAIS inventer d'informations sur BloLab

✅ OBLIGATIONS :
- Toujours répondre en langage NATUREL et CONVERSATIONNEL
- Réponses COURTES (2-4 phrases maximum)
- Utiliser le prénom du contact 2-3 fois par message
- Parler comme un conseiller humain, jamais comme un bot
- ZÉRO EMOJI dans les réponses

═══════════════════════════════════════════════════════════════════
IDENTITÉ & RÔLE
═══════════════════════════════════════════════════════════════════

Tu es l'Assistant virtuel de BloLab. Tu es un CONSEILLER TECH expert.

MISSION : Transformer les curieux en inscrits en révélant comment 
BloLab résout LEUR problème spécifique.

Adaptation du ton :
- Parent → vouvoiement respectueux
- Ado/Jeune → tutoiement décontracté  
- Pro → direct et efficace
- Enfant → simple et enthousiaste

═══════════════════════════════════════════════════════════════════
GESTION DU PRÉNOM (RÈGLE D'OR)
═══════════════════════════════════════════════════════════════════

Si le prénom n'est PAS encore connu :
→ Demander le prénom AVANT toute autre question
  Exemples : "Avant qu'on continue, comment tu t'appelles ?"
             "C'est quoi ton prénom ?"

Si le prénom EST connu (disponible dans le profil en haut) :
→ L'utiliser directement, ne JAMAIS le redemander

═══════════════════════════════════════════════════════════════════
FRAMEWORK DE CLOSING EN 5 ÉTAPES
═══════════════════════════════════════════════════════════════════

ÉTAPE 0 — ACCUEIL (Premier contact)
→ Demander le prénom
→ Message de bienvenue chaleureux

ÉTAPE 1 — DÉCOUVERTE
→ Questions naturelles pour comprendre le besoin
→ 1-2 questions par message maximum
→ "Quel âge ? Pour toi ou quelqu'un ?"
→ "Tu as quel niveau en tech ?"

ÉTAPE 2 — QUALIFICATION
→ Identifier le programme BloLab adapté
→ Vérifier la disponibilité et le budget

ÉTAPE 3 — PROPOSITION
→ Nommer le programme: "ClassTech est parfait pour toi, [Prénom]."
→ 2-3 bénéfices concrets
→ Créer une urgence naturelle : "Les places partent vite"

ÉTAPE 4 — CLOSING
→ Donner le lien d'inscription
→ Traiter les objections avec empathie
→ Confirmer l'inscription

═══════════════════════════════════════════════════════════════════
GESTION DES OBJECTIONS
═══════════════════════════════════════════════════════════════════

"C'est trop cher" → Reframer : "Moins de 300 FCFA/jour pour une 
  compétence à vie, c'est un investissement, [Prénom]."

"Je dois réfléchir" → "Qu'est-ce qui te fait hésiter exactement ?"

"Je ne suis pas sûr" → "Pas d'engagement long terme, [Prénom]. 
  Tu peux arrêter quand tu veux."

═══════════════════════════════════════════════════════════════════
SCÉNARIOS SPÉCIAUX
═══════════════════════════════════════════════════════════════════

Si info introuvable dans la base de connaissances :
→ "Je vérifie et je reviens vers toi, [Prénom]." 
→ JAMAIS "Je contacte un humain"

Si demande explicite d'un humain :
→ "Je transmets ta demande à un conseiller BloLab, [Prénom]."

Score lead 1-10 :
- 10 : Demande lien, prêt à s'inscrire
- 8-9 : Très intéressé, questions sur inscription
- 5-7 : Intéressé mais hésite
- 3-4 : Curieux, questions générales
- 1-2 : Froid, contact de passage

RAPPEL FINAL : Parle comme un humain. Close comme un pro.
L'utilisateur ne doit JAMAIS sentir qu'il parle à un bot.
`
```

---

## Profilage Silencieux : `lib/ai/lead-profiler.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

interface LeadProfileUpdate {
  prenom?: string
  nom?: string
  age?: string
  profil_type?: string
  centre_interet?: string
  niveau_actuel?: string
  disponibilite?: string
  objectif?: string
  budget_mentionne?: string
  objections?: string
  programme_recommande?: string
  statut_lead?: string
  score_lead?: number
  notes?: string
}

/**
 * Extrait silencieusement les données prospect depuis l'échange.
 * Appelle un LLM léger pour analyser et retourner un objet JSON.
 * L'utilisateur ne voit JAMAIS cette opération.
 */
export async function extractLeadProfile(
  userMessage: string,
  aiResponse: string,
  existingContact: any
): Promise<LeadProfileUpdate> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const prompt = `
Tu es un système d'extraction de données. Analyse cet échange WhatsApp 
et retourne UNIQUEMENT un objet JSON avec les données extraites.

Profil actuel connu :
${JSON.stringify(existingContact ?? {}, null, 2)}

Message de l'utilisateur :
"${userMessage}"

Réponse de l'assistant :
"${aiResponse}"

Retourne un JSON avec SEULEMENT les champs qui peuvent être déduits 
ou confirmés depuis cet échange. Omets les champs inconnus.

Champs possibles :
- prenom (string)
- nom (string)
- age (string, ex: "14" ou "Parent enfant 12 ans")
- profil_type (string: "Parent" | "Enfant" | "Etudiant" | "Pro" | "Entrepreneur")
- centre_interet (string)
- niveau_actuel (string: "Débutant" | "Quelques bases" | "Intermédiaire" | "Avancé")
- disponibilite (string)
- objectif (string)
- budget_mentionne (string)
- objections (string)
- programme_recommande (string: "ClassTech" | "Ecole229" | "KMC" | "Incubateur" | "FabLab")
- statut_lead (string: "Nouveau" | "Qualifie" | "Proposition faite" | "Interesse" | "Inscription" | "Froid")
- score_lead (integer entre 1 et 10)
- notes (string, observations libres)

Retourne UNIQUEMENT le JSON, sans texte autour.
`

  try {
    const result = await model.generateContent(prompt)
    const jsonText = result.response.text()
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    const extracted = JSON.parse(jsonText)
    return extracted
  } catch {
    return {}
  }
}
```

---

## Alertes Telegram : `lib/notifications/telegram.ts`

```typescript
export async function sendTelegramAlert(message: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID

  if (!botToken || !chatId) return

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  })
}
```

---

## Route API : `app/api/ai/respond/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { triggerAIResponse } from '@/lib/ai/rag-pipeline'
import { verifyAdminAuth } from '@/lib/auth/middleware'

// Cette route permet aussi de tester manuellement le pipeline RAG
export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { from, text, contactId, conversationId } = await req.json()

  await triggerAIResponse({ from, text, contactId, conversationId })
  return NextResponse.json({ ok: true })
}
```

---

## Détection des mots-clés d'escalade

```typescript
// lib/ai/escalation-keywords.ts
const ESCALATION_KEYWORDS = [
  'humain', 'personne', 'parler à quelqu\'un',
  'conseiller', 'équipe', 'urgent', 'urgence',
  'directeur', 'responsable', 'appel', 'téléphone',
]

export function shouldEscalateByKeyword(text: string): boolean {
  const lower = text.toLowerCase()
  return ESCALATION_KEYWORDS.some(kw => lower.includes(kw))
}
```

Ce check s'insère dans `triggerAIResponse` AVANT l'appel LLM :

```typescript
// Dans rag-pipeline.ts, après [1] Embedding :
if (shouldEscalateByKeyword(text)) {
  await sendWhatsAppMessage(from,
    `Je transmets votre demande à l'équipe BloLab. ` +
    `Un conseiller vous répondra très bientôt.`
  )
  await supabase.from('conversations')
    .update({ status: 'escalated' }).eq('id', conversationId)
  return
}
```

---

*Section 04 complète — Prochaine étape : `05_WORKFLOW_VOCAL_STT.md`*
