# 05 — Workflow 3 : Pipeline Vocal (STT + Confidence Scoring)
## BloLab Dashboard CRM WhatsApp IA

---

## Vue d'ensemble

Ce pipeline traite tous les messages vocaux (audio/PTT) reçus. Il applique une logique à 3 niveaux basée sur le score de confiance de la transcription, en tenant compte de la réalité linguistique de BloLab (français béninois, Fon, Yoruba, Dendi…).

```
Message audio/PTT (depuis Workflow 03)
    │
    │  (média déjà stocké dans Supabase Storage)
    │
    ▼
[1] Envoi au modèle STT (interface abstraite)
    │   └── Provider 1 : Groq / Whisper large-v3 (défaut)
    │   └── Provider 2 : Gemini Audio (fallback / langues africaines)
    │
    ▼
[2] Résultat : { transcript, confidence, language }
    │
    ▼
[3] Évaluation du score
    │
    ├── score > 0.80 (Cas A — Haute confiance)
    │       └── Pipeline RAG normal → Réponse IA
    │
    ├── 0.50 < score ≤ 0.80 (Cas B — Confiance moyenne)
    │       └── Transcription partielle affichée + alerte admin
    │       └── Message d'attente envoyé au contact
    │
    └── score < 0.50 ou ÉCHEC (Cas C — Faible confiance)
            └── Statut "vocal_pending" + escalade prioritaire
            └── Message d'attente envoyé au contact
    │
    ▼
[4] Tag "langue_vernaculaire" si langue ≠ 'fr'
    │
    ▼
[5] Mise à jour message en base (transcript + confidence)
    │
    ▼
[6] Push Supabase Realtime → dashboard admin
```

---

## Interface Abstraite STT : `lib/ai/stt/index.ts`

```typescript
export interface STTResult {
  transcript: string | null
  confidence: number       // 0.0 à 1.0
  language: string         // Code ISO: 'fr', 'yo', 'fon', 'unknown'
  provider: string
  durationSeconds?: number
}

export type STTProvider = 'groq' | 'gemini'

/**
 * Interface abstraite : on peut changer de provider STT
 * sans toucher au reste du pipeline.
 */
export async function transcribeAudio(
  audioUrl: string,        // URL Supabase Storage (fichier déjà stocké)
  provider: STTProvider = 'groq'
): Promise<STTResult> {
  switch (provider) {
    case 'groq':
      return transcribeWithGroq(audioUrl)
    case 'gemini':
      return transcribeWithGemini(audioUrl)
    default:
      throw new Error(`Provider STT inconnu: ${provider}`)
  }
}

// ─── Provider Groq / Whisper large-v3 ────────────────────────────

async function transcribeWithGroq(audioUrl: string): Promise<STTResult> {
  // Télécharger le fichier depuis Supabase Storage
  const audioRes = await fetch(audioUrl)
  const audioBlob = await audioRes.blob()

  const formData = new FormData()
  formData.append('file', audioBlob, 'audio.ogg')
  formData.append('model', 'whisper-large-v3')
  formData.append('response_format', 'verbose_json')  // inclut segments + language
  formData.append('language', 'fr')  // Hint français, mais Whisper détecte quand même

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData,
  })

  if (!res.ok) {
    return { transcript: null, confidence: 0, language: 'unknown', provider: 'groq' }
  }

  const data = await res.json()

  // Groq/Whisper retourne des segments avec avg_logprob
  // On calcule le score de confiance moyen
  const segments: any[] = data.segments ?? []
  const avgLogProb = segments.length > 0
    ? segments.reduce((acc: number, s: any) => acc + s.avg_logprob, 0) / segments.length
    : -0.8

  // Conversion log-prob → probabilité ∈ [0, 1]
  // logprob = 0 → probabilité = 1.0, logprob = -1 → ~0.37
  const confidence = Math.min(1, Math.max(0, Math.exp(avgLogProb)))

  return {
    transcript: data.text ?? null,
    confidence,
    language: data.language ?? 'fr',
    provider: 'groq',
    durationSeconds: data.duration,
  }
}

// ─── Provider Gemini Audio ────────────────────────────────────────

async function transcribeWithGemini(audioUrl: string): Promise<STTResult> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

  const audioRes = await fetch(audioUrl)
  const audioBuffer = await audioRes.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')

  // Déterminer le mimetype depuis l'URL
  const mimeType = audioUrl.includes('.mp3') ? 'audio/mp3' :
                   audioUrl.includes('.mp4') ? 'audio/mp4' : 'audio/ogg'

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const result = await model.generateContent([
    {
      inlineData: { mimeType, data: audioBase64 }
    },
    {
      text: `Transcris exactement ce qui est dit dans cet audio. 
      L'audio peut être en français, en Fon, en Yoruba, en Dendi ou en Bariba.
      Réponds avec UNIQUEMENT un JSON: 
      {"transcript": "...", "language": "fr|fon|yo|dendi|bariba|unknown", "confidence": 0.0-1.0}`
    }
  ])

  try {
    const json = JSON.parse(result.response.text().replace(/```json|```/g, '').trim())
    return {
      transcript: json.transcript,
      confidence: json.confidence ?? 0.7,
      language: json.language ?? 'fr',
      provider: 'gemini',
    }
  } catch {
    return { transcript: null, confidence: 0, language: 'unknown', provider: 'gemini' }
  }
}
```

---

## Pipeline Principal : `lib/ai/stt/pipeline.ts`

```typescript
import { transcribeAudio } from './index'
import { triggerAIResponse } from '@/lib/ai/rag-pipeline'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { sendTelegramAlert } from '@/lib/notifications/telegram'
import { createClient } from '@/lib/supabase/server'

export interface STTPipelineInput {
  from: string
  mediaUrl: string
  mediaInfo: { mimetype: string; ptt?: boolean }
  contactId: string
  conversationId: string
  messageId: string   // ID du message en base (pour la mise à jour)
}

const CONFIDENCE_HIGH   = 0.80  // Cas A : RAG normal
const CONFIDENCE_MEDIUM = 0.50  // Cas B : alerte admin
// En dessous de MEDIUM = Cas C : escalade prioritaire

export async function triggerSTTPipeline(input: STTPipelineInput): Promise<void> {
  const { from, mediaUrl, contactId, conversationId, messageId } = input
  const supabase = createClient()

  // ─── [1] TRANSCRIPTION ─────────────────────────────────────────
  let sttResult = await transcribeAudio(mediaUrl, 'groq')

  // Si Groq échoue ou confidence très basse → retry avec Gemini Audio
  if (!sttResult.transcript || sttResult.confidence < 0.30) {
    console.log('[STT] Groq faible, retry avec Gemini Audio...')
    sttResult = await transcribeAudio(mediaUrl, 'gemini')
  }

  const { transcript, confidence, language } = sttResult

  // ─── [2] TAG LANGUE VERNACULAIRE ───────────────────────────────
  const isVernacular = language !== 'fr' && language !== 'unknown'
  if (isVernacular) {
    await supabase
      .from('contacts')
      .update({ langue_vernaculaire: true, tags: supabase.rpc('array_append', { arr: 'tags', elem: 'langue_vernaculaire' }) })
      .eq('id', contactId)
  }

  // ─── [3] MISE À JOUR DU MESSAGE EN BASE ────────────────────────
  const transcriptStatus =
    !transcript || confidence < CONFIDENCE_MEDIUM ? 'low' :
    confidence < CONFIDENCE_HIGH                  ? 'medium' : 'high'

  await supabase
    .from('messages')
    .update({
      transcript: transcript ?? null,
      transcript_confidence: confidence,
      transcript_language: language,
      transcript_status: transcriptStatus,
    })
    .eq('id', messageId)

  // ─── [4] DISPATCH SELON LE SCORE ───────────────────────────────

  // CAS A — Haute confiance : on traite comme un texte normal
  if (transcript && confidence >= CONFIDENCE_HIGH) {
    await handleCasA({ transcript, from, contactId, conversationId, supabase })
    return
  }

  // CAS B — Confiance partielle : transcription affichée, alerte admin
  if (transcript && confidence >= CONFIDENCE_MEDIUM) {
    await handleCasB({ from, transcript, confidence, language, conversationId, contactId, supabase })
    return
  }

  // CAS C — Confiance trop faible ou échec total
  await handleCasC({ from, conversationId, contactId, language, supabase })
}

// ─── CAS A : Haute confiance ──────────────────────────────────────
async function handleCasA({
  transcript, from, contactId, conversationId, supabase
}: any) {
  // Tracer dans la conversation que c'est un vocal transcrit
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    contact_id: contactId,
    direction: 'inbound',
    message_type: 'text',
    body: `🎙️ [Transcription haute confiance] ${transcript}`,
    is_ai_response: false,
  })

  // Pipeline RAG normal avec la transcription
  await triggerAIResponse({
    from,
    text: transcript,
    contactId,
    conversationId,
  })
}

// ─── CAS B : Confiance partielle ─────────────────────────────────
async function handleCasB({
  from, transcript, confidence, language, conversationId, contactId, supabase
}: any) {
  // Message d'attente au contact
  await sendWhatsAppMessage(from,
    `Nous avons bien reçu votre message vocal. ` +
    `Un membre de notre équipe vous répondra très bientôt.`
  )

  // Mise à jour statut conversation
  await supabase
    .from('conversations')
    .update({ status: 'escalated' })
    .eq('id', conversationId)

  // Alerte admin (Telegram)
  const langInfo = language !== 'fr' ? ` | Langue détectée: ${language.toUpperCase()}` : ''
  await sendTelegramAlert(
    `⚠️ *Vocal — Transcription incertaine*\n` +
    `Confiance: ${Math.round(confidence * 100)}%${langInfo}\n` +
    `Transcription partielle: "${transcript}"\n` +
    `Contact: ${from}\n` +
    `→ Vérifiez l'inbox et écoutez le vocal.`
  )
}

// ─── CAS C : Échec total ──────────────────────────────────────────
async function handleCasC({
  from, conversationId, contactId, language, supabase
}: any) {
  // Message d'attente identique
  await sendWhatsAppMessage(from,
    `Nous avons bien reçu votre message vocal. ` +
    `Un membre de notre équipe vous répondra très bientôt.`
  )

  // Statut spécial "vocal_pending" — remonte en priorité dans l'inbox
  await supabase
    .from('conversations')
    .update({ status: 'vocal_pending' })
    .eq('id', conversationId)

  // Alerte admin prioritaire
  const langInfo = language && language !== 'fr' && language !== 'unknown'
    ? ` | Langue probablement: ${language.toUpperCase()}`
    : ' | Langue non identifiée'

  await sendTelegramAlert(
    `🔴 *Vocal non transcrit — Priorité haute*\n` +
    `Raison: confidence trop faible ou langue non reconnue${langInfo}\n` +
    `Contact: ${from}\n` +
    `→ Écoutez manuellement depuis l'inbox.`
  )
}
```

---

## Route API : `app/api/ai/transcribe/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { triggerSTTPipeline } from '@/lib/ai/stt/pipeline'
import { verifyAdminAuth } from '@/lib/auth/middleware'

export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  await triggerSTTPipeline(body)
  return NextResponse.json({ ok: true })
}
```

---

## Interface Dashboard — Gestion des Vocaux

Dans le composant `ChatWindow.tsx`, les messages vocaux s'affichent ainsi :

```typescript
// components/inbox/AudioMessageBubble.tsx
interface AudioMessageProps {
  message: Message  // message_type === 'audio'
}

export function AudioMessageBubble({ message }: AudioMessageProps) {
  const confidenceColor =
    (message.transcript_confidence ?? 0) >= 0.80 ? 'text-green-600' :
    (message.transcript_confidence ?? 0) >= 0.50 ? 'text-amber-500' : 'text-red-500'

  const confidenceBadge =
    message.transcript_status === 'high'   ? '✅ Haute confiance' :
    message.transcript_status === 'medium' ? '⚠️ Transcription incertaine' :
    message.transcript_status === 'low'    ? '🔴 Vocal non transcrit' : ''

  return (
    <div className="flex flex-col gap-1 p-3 bg-gray-100 rounded-xl max-w-sm">
      {/* Lecteur audio natif */}
      <audio controls src={message.media_url ?? ''} className="w-full" />

      {/* Transcription */}
      {message.transcript && (
        <div className="mt-2 text-sm text-gray-700">
          <span className="font-medium">🎙️ Transcription :</span>
          <p className="mt-1 italic">{message.transcript}</p>
        </div>
      )}

      {/* Badge de confiance */}
      {confidenceBadge && (
        <span className={`text-xs font-medium mt-1 ${confidenceColor}`}>
          {confidenceBadge}
          {message.transcript_confidence !== null &&
            ` (${Math.round((message.transcript_confidence ?? 0) * 100)}%)`}
        </span>
      )}

      {/* Bouton correction manuelle */}
      {message.transcript && (
        <button
          className="text-xs text-blue-500 underline mt-1 text-left"
          onClick={() => {/* ouvre modal de correction */}}
        >
          Corriger la transcription
        </button>
      )}
    </div>
  )
}
```

---

## Tableau récapitulatif des cas

| Cas | Score | Action IA | Notification admin | Statut conversation |
|-----|-------|-----------|-------------------|---------------------|
| **A** | > 0.80 | Pipeline RAG normal ✅ | Aucune | `ai_active` |
| **B** | 0.50–0.80 | Silencieuse ⏸️ | Telegram ⚠️ | `escalated` |
| **C** | < 0.50 ou échec | Silencieuse ❌ | Telegram 🔴 urgent | `vocal_pending` |
| **Vernacular** | N/A | Selon cas | Tag automatique | + filtre inbox |

---

*Section 05 complète — Prochaine étape : `06_WORKFLOW_SCRAPING_RAG.md`*
