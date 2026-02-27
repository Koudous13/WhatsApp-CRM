# 06 — Workflow 4 : Scraping blolab.bj & Base de Connaissances (RAG)
## BloLab Dashboard CRM WhatsApp IA

---

## Vue d'ensemble

Ce workflow maintient à jour la base de connaissances vectorielle utilisée par l'agent IA. Il peut être déclenché manuellement depuis le dashboard ou automatiquement via un cron Vercel hebdomadaire.

```
Déclencheur : Manuel (dashboard) ou Cron Vercel (hebdomadaire)
    │
    ▼
[1] Création d'un job de scraping en base (scraping_jobs)
    │
    ▼
[2] Pour chaque URL configurée de blolab.bj :
    │   ├── Fetch de la page HTML
    │   ├── Extraction du texte (Cheerio)
    │   └── Découpage en chunks (paragraphes + overlap)
    │
    ▼
[3] Pour chaque chunk :
    │   ├── Génération de l'embedding (Gemini Embedding 001)
    │   └── Upsert dans knowledge_base (pgvector)
    │
    ▼
[4] Versioning — nouvelle version créée, ancienne désactivée
    │
    ▼
[5] Mise à jour du job (success/failed + stats)
    │
    ▼
[6] Notification dashboard + alerte email si échec
```

---

## Pages à Scraper (configurables dans le dashboard)

```typescript
// lib/scraper/config.ts
export const SCRAPE_TARGETS = [
  {
    url: 'https://blolab.bj/formations',
    section: 'formations',
    description: 'Programmes Ecole229, ClassTech, KMC — calendriers, prix, conditions',
  },
  {
    url: 'https://blolab.bj/fablab',
    section: 'fablab',
    description: 'Équipements, modalités d\'accès, tarifs FabLab',
  },
  {
    url: 'https://blolab.bj/incubateur',
    section: 'incubateur',
    description: 'Programmes d\'accompagnement, critères d\'éligibilité',
  },
  {
    url: 'https://blolab.bj/blobus',
    section: 'blobus',
    description: 'Calendrier, déplacements, demandes de prestation',
  },
  {
    url: 'https://blolab.bj/projets',
    section: 'projets',
    description: 'Projets passés et en cours',
  },
  {
    url: 'https://blolab.bj/blog',
    section: 'blog',
    description: 'Articles récents',
  },
  {
    url: 'https://blolab.bj/contact',
    section: 'contact',
    description: 'Coordonnées, adresses Cotonou et Parakou',
  },
  {
    url: 'https://blolab.bj',
    section: 'accueil',
    description: 'Présentation générale de BloLab',
  },
]
```

---

## Scraper : `lib/scraper/blolab-scraper.ts`

```typescript
import * as cheerio from 'cheerio'

export interface ScrapedChunk {
  content: string
  sourceUrl: string
  section: string
  chunkIndex: number
}

/**
 * Scrape une page et retourne des chunks de texte prêts pour l'embedding.
 */
export async function scrapePage(
  url: string,
  section: string
): Promise<ScrapedChunk[]> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'BloLab-KnowledgeBot/1.0 (+https://blolab.bj)',
    },
    next: { revalidate: 0 },  // pas de cache Next.js
  })

  if (!res.ok) {
    throw new Error(`[Scraper] Échec fetch ${url}: HTTP ${res.status}`)
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  // Supprimer les éléments non textuels
  $('script, style, nav, footer, header, .cookie-banner, .menu').remove()

  // Extraire le contenu principal
  const mainContent =
    $('main').text() ||
    $('article').text() ||
    $('[class*="content"]').text() ||
    $('body').text()

  const cleanedText = mainContent
    .replace(/\s+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Découpage en chunks
  return chunkText(cleanedText, url, section)
}

/**
 * Découpe un texte long en chunks de ~500 tokens avec 50 tokens d'overlap.
 * On travaille sur les paragraphes pour préserver la cohérence sémantique.
 */
function chunkText(
  text: string,
  sourceUrl: string,
  section: string
): ScrapedChunk[] {
  const CHUNK_SIZE = 500    // caractères cibles par chunk
  const OVERLAP = 80        // chevauchement entre chunks

  // Découper d'abord par doubles sauts de ligne (paragraphes)
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 30)  // ignorer les paragraphes trop courts

  const chunks: ScrapedChunk[] = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const para of paragraphs) {
    // Si ajouter ce paragraphe dépasse CHUNK_SIZE, on sauvegarde
    if (currentChunk.length + para.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        sourceUrl,
        section,
        chunkIndex: chunkIndex++,
      })

      // Overlap : on garde les derniers OVERLAP caractères du chunk précédent
      const overlap = currentChunk.slice(-OVERLAP)
      currentChunk = overlap + ' ' + para
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para
    }
  }

  // Dernier chunk restant
  if (currentChunk.trim().length > 30) {
    chunks.push({
      content: currentChunk.trim(),
      sourceUrl,
      section,
      chunkIndex: chunkIndex++,
    })
  }

  return chunks
}
```

---

## Pipeline d'Embedding : `lib/scraper/embedding-pipeline.ts`

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'
import type { ScrapedChunk } from './blolab-scraper'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/**
 * Génère les embeddings pour un batch de chunks et les upsert dans pgvector.
 * Traite par batch de 10 pour éviter les rate limits.
 */
export async function embedAndStorechunks(
  chunks: ScrapedChunk[],
  version: number
): Promise<number> {
  const supabase = createClient()
  const embeddingModel = genAI.getGenerativeModel({
    model: 'models/gemini-embedding-001',
  })

  const BATCH_SIZE = 10
  let storedCount = 0

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    // Générer les embeddings en parallèle pour le batch
    const embeddingResults = await Promise.all(
      batch.map(chunk =>
        embeddingModel.embedContent({
          content: { parts: [{ text: chunk.content }], role: 'user' },
          taskType: 'RETRIEVAL_DOCUMENT',
        })
      )
    )

    // Préparer les lignes à insérer
    const rows = batch.map((chunk, idx) => ({
      content: chunk.content,
      embedding: embeddingResults[idx].embedding.values,
      source_url: chunk.sourceUrl,
      section: chunk.section,
      chunk_index: chunk.chunkIndex,
      scrape_version: version,
      is_manual: false,
      is_active: true,
    }))

    const { error } = await supabase
      .from('knowledge_base')
      .insert(rows)

    if (error) {
      console.error(`[Embedding] Erreur batch ${i}:`, error.message)
    } else {
      storedCount += batch.length
    }

    // Pause anti-rate-limit (50ms entre batches)
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return storedCount
}

/**
 * Désactive les chunks de l'ancienne version (versioning / rollback).
 */
export async function deactivateOldVersion(
  newVersion: number
): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('knowledge_base')
    .update({ is_active: false })
    .lt('scrape_version', newVersion)
    .eq('is_manual', false)   // Ne jamais désactiver les chunks manuels
}
```

---

## Route API — Déclenchement Manuel : `app/api/knowledge/scrape/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'
import { scrapePage } from '@/lib/scraper/blolab-scraper'
import { embedAndStoreChunks, deactivateOldVersion } from '@/lib/scraper/embedding-pipeline'
import { SCRAPE_TARGETS } from '@/lib/scraper/config'
import { sendEmailAlert } from '@/lib/notifications/email'

export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()

  // Déterminer la nouvelle version
  const { data: lastJob } = await supabase
    .from('scraping_jobs')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const newVersion = (lastJob?.version ?? 0) + 1

  // Créer le job en base
  const { data: job } = await supabase
    .from('scraping_jobs')
    .insert({
      triggered_by: auth.userId,
      status: 'running',
      version: newVersion,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const jobId = job!.id

  // Répondre immédiatement au dashboard (le scraping continue en arrière-plan)
  runScraping(jobId, newVersion, supabase).catch(console.error)

  return NextResponse.json({ ok: true, jobId, version: newVersion })
}

async function runScraping(
  jobId: string,
  version: number,
  supabase: any
): Promise<void> {
  let totalChunks = 0
  let pagesScraped = 0
  let hasError = false

  try {
    for (const target of SCRAPE_TARGETS) {
      try {
        const chunks = await scrapePage(target.url, target.section)
        const stored = await embedAndStoreChunks(chunks, version)
        totalChunks += stored
        pagesScraped++
      } catch (pageErr: any) {
        console.error(`[Scraping] Erreur page ${target.url}:`, pageErr.message)
        // On continue avec les autres pages même si une échoue
      }
    }

    // Désactiver les anciens chunks (versioning)
    await deactivateOldVersion(version)

    // Marquer le job comme terminé
    await supabase
      .from('scraping_jobs')
      .update({
        status: 'success',
        pages_scraped: pagesScraped,
        chunks_created: totalChunks,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

  } catch (err: any) {
    hasError = true
    await supabase
      .from('scraping_jobs')
      .update({
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    // Alerte email si scraping échoue
    await sendEmailAlert({
      subject: '⚠️ BloLab CRM — Échec du scraping blolab.bj',
      html: `<p>Le scraping de blolab.bj a échoué.</p><pre>${err.message}</pre>`,
    })
  }
}
```

---

## Cron Vercel Hebdomadaire : `app/api/cron/scrape/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

// Ce endpoint est appelé par Vercel Cron (voir vercel.json)
export async function GET(req: NextRequest) {
  // Vérifier le secret Cron pour empêcher les appels non autorisés
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Réutiliser la même logique que le déclenchement manuel
  const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/knowledge/scrape`, {
    method: 'POST',
    headers: {
      // Appel interne authentifié avec le service role
      'x-internal-cron': process.env.CRON_SECRET!,
    },
  })

  return NextResponse.json({ ok: res.ok })
}
```

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 3 * * 1"
    },
    {
      "path": "/api/cron/session-check",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## Ajout Manuel de Connaissances : `app/api/knowledge/chunks/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

// GET — Liste des chunks manuels
export async function GET(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { data } = await supabase
    .from('knowledge_base')
    .select('id, content, source_url, section, is_manual, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return NextResponse.json(data)
}

// POST — Ajouter un chunk manuel (texte libre ou FAQ)
export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content, section } = await req.json()
  if (!content) return NextResponse.json({ error: 'content requis' }, { status: 400 })

  const embeddingModel = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' })
  const result = await embeddingModel.embedContent(content)

  const supabase = createClient()
  const { data } = await supabase
    .from('knowledge_base')
    .insert({
      content,
      embedding: result.embedding.values,
      section: section ?? 'manuel',
      is_manual: true,
      is_active: true,
    })
    .select('id')
    .single()

  return NextResponse.json({ ok: true, id: data?.id })
}

// DELETE — Désactiver un chunk
export async function DELETE(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  const supabase = createClient()
  await supabase.from('knowledge_base').update({ is_active: false }).eq('id', id)

  return NextResponse.json({ ok: true })
}
```

---

## Playground de Test RAG : `app/api/knowledge/search/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

// Simule une recherche RAG — utilisé dans le playground du dashboard
export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query, threshold = 0.75, limit = 5 } = await req.json()

  const embeddingModel = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' })
  const result = await embeddingModel.embedContent(query)

  const supabase = createClient()
  const { data: chunks } = await supabase.rpc('search_knowledge', {
    query_embedding: result.embedding.values,
    similarity_threshold: threshold,
    match_count: limit,
  })

  return NextResponse.json({ chunks, count: chunks?.length ?? 0 })
}
```

---

## Rollback d'une Version

```typescript
// app/api/knowledge/rollback/route.ts
export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { targetVersion } = await req.json()
  const supabase = createClient()

  // Désactiver la version courante
  await supabase
    .from('knowledge_base')
    .update({ is_active: false })
    .neq('scrape_version', targetVersion)
    .eq('is_manual', false)

  // Réactiver la version cible
  await supabase
    .from('knowledge_base')
    .update({ is_active: true })
    .eq('scrape_version', targetVersion)

  return NextResponse.json({ ok: true, restoredVersion: targetVersion })
}
```

---

*Section 06 complète — Prochaine étape : `07_WORKFLOW_BROADCAST.md`*
