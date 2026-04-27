# HIGH-07 — STT vocal : implémenter ou retirer de la spec

**Sévérité** : Haute (divergence produit)
**Effort** : L (3–5 jours si implémentation)
**Finding parent** : `AUDIT.md` §3.HIGH-07, gap SPEC W3

## Contexte

La spec `TECH_SPEC/05_WORKFLOW_VOCAL_STT.md` décrit un pipeline complet : téléchargement de l'audio (fenêtre 1h WhatsApp), upload Supabase Storage, transcription via Groq/Whisper avec fallback Gemini Audio, confidence scoring, routage selon score, tag `langue_vernaculaire`.

État actuel : **aucune de ces pièces n'existe**. Le webhook escalade tout message non-texte directement vers un humain (`webhooks/wasender/route.ts:183-192`).

Conséquences :
- Coût humain croissant si le volume de vocaux augmente (le public BloLab au Bénin parle beaucoup en vocal en français / fon / yoruba).
- Feature annoncée non livrée → attentes produit erronées.
- Variable `GROQ_API_KEY` dans la spec mais pas dans le code.

## Décision produit à prendre

**Option A — Implémenter STT**
- Suivre la spec W3 : Groq Whisper large-v3 principal, Gemini Audio fallback.
- Effort estimé : 3–5 jours (+ tests sur audio réel).

**Option B — Retirer de la spec, garder l'escalade**
- Mettre à jour `TECH_SPEC/05_WORKFLOW_VOCAL_STT.md` avec "hors MVP, escalade humaine uniquement".
- Effort : 30 min.

## Étapes (Option A)

### 1. Créer l'interface abstraite

```ts
// lib/ai/stt/types.ts
export interface STTProvider {
    name: string
    transcribe(audioBuffer: Buffer, mimeType: string): Promise<{
        text: string
        confidence: number
        language?: string
    }>
}
```

### 2. Provider Groq

```ts
// lib/ai/stt/groq.ts
export const groqProvider: STTProvider = {
    name: 'groq',
    async transcribe(buffer, mimeType) {
        const formData = new FormData()
        formData.append('file', new Blob([buffer], { type: mimeType }), 'audio.ogg')
        formData.append('model', 'whisper-large-v3')
        formData.append('response_format', 'verbose_json')

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            body: formData,
        })
        const data = await res.json()
        return {
            text: data.text,
            confidence: computeConfidence(data.segments),
            language: data.language,
        }
    }
}
```

### 3. Télécharger l'audio depuis WaSenderAPI

Dans `webhooks/wasender/route.ts`, pour `messageType === 'audioMessage'` :
```ts
const audioUrl = msgObj?.message?.audioMessage?.url
// Télécharger en AES256 déchiffré (selon API WaSenderAPI)
const audioBuffer = await downloadWaSenderMedia(audioUrl)
```

(Vérifier la doc WaSenderAPI pour la méthode exacte de déchiffrement.)

### 4. Upload Supabase Storage

```ts
const { data, error } = await supabase.storage
    .from('whatsapp-audio')
    .upload(`${messageId}.ogg`, audioBuffer, { contentType: 'audio/ogg' })
```

(Créer le bucket `whatsapp-audio` avec RLS admin-only.)

### 5. Appeler STT + router selon confidence

```ts
const { text, confidence, language } = await groqProvider.transcribe(audioBuffer, 'audio/ogg')

// Stocker la transcription
await supabase.from('messages').update({ transcript: text, transcript_confidence: confidence })
    .eq('wasender_message_id', messageId)

if (confidence > 0.80) {
    // Pipeline RAG normal
    await triggerAIResponse({ from, text, conversationId })
} else if (confidence >= 0.50) {
    // Alerter admin + message d'attente
    await sendWhatsAppMessage(from, "J'ai bien reçu votre message vocal, un conseiller va vous répondre rapidement.")
    await sendTelegramAlert(`Vocal confidence moyenne (${confidence}): ${text}`)
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conversationId)
} else {
    // Escalade sans transcription
    await sendWhatsAppMessage(from, "Nous avons bien reçu votre message vocal, un conseiller vous répond au plus vite.")
    await supabase.from('conversations').update({ status: 'escalated' }).eq('id', conversationId)
}
```

### 6. Schéma DB

Ajouter les colonnes :
```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_confidence NUMERIC;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_language TEXT;
```

### 7. Tests

- Envoyer un vocal depuis un vrai WhatsApp test → vérifier transcription.
- Tester confidence basse (parler très mal / bruit de fond).
- Tester langue autre que français (fon, yoruba).

## Critères d'acceptation

- Un message vocal reçu est transcrit et stocké dans `messages.transcript`.
- Si confidence > 0.80, le pipeline RAG répond automatiquement.
- Sinon, escalade humaine + alerte Telegram.
- La transcription marche sur des audios en français.

## Dépendances

- CRIT-01 (webhook auth) doit être fait avant pour ne pas leaker les audios.
- Capacité Supabase Storage à activer (bucket + policies).
