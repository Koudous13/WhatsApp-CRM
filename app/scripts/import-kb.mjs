/**
 * Script d'import KB blolab_base_informations.md → Supabase documents
 * Usage : node scripts/import-kb.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://oejsmgyzirwypwvsqymn.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY

if (!SUPABASE_SERVICE_KEY || !GEMINI_KEY) {
    console.error('❌ Variables manquantes.')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

/** Embedding via API REST Gemini v1 (pas le SDK qui force v1beta) */
async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${JSON.stringify(json)}`)
    return json.embedding.values
}

// ── Lire le fichier ──────────────────────────────────────────────────
const raw = readFileSync('d:/WhatsApp CRM/blolab_base_informations.md', 'utf-8')

// ── Découper en chunks par sections (séparées par ---) ───────────────
function splitIntoChunks(text) {
    const sections = text.split(/\n---\n/)
    const chunks = []

    for (const section of sections) {
        const trimmed = section.trim()
        if (!trimmed || trimmed.length < 50) continue

        // Extraire le titre (première ligne en # ou ##)
        const titleMatch = trimmed.match(/^#{1,3}\s+(.+)$/m)
        const sectionTitle = titleMatch ? titleMatch[1].trim() : 'BloLab'

        // Si le chunk est trop long (>3000 chars), sous-diviser par sous-sections
        if (trimmed.length > 3000) {
            const subSections = trimmed.split(/\n#{3,4}\s+/)
            for (const sub of subSections) {
                const subTrimmed = sub.trim()
                if (subTrimmed.length < 50) continue
                const subTitleMatch = subTrimmed.match(/^(.+)\n/)
                const subTitle = subTitleMatch ? subTitleMatch[1].replace(/^#+\s*/, '').trim() : sectionTitle
                chunks.push({ content: subTrimmed, section: subTitle || sectionTitle })
            }
        } else {
            chunks.push({ content: trimmed, section: sectionTitle })
        }
    }

    return chunks
}

const chunks = splitIntoChunks(raw)
console.log(`📚 ${chunks.length} chunks à importer`)

// ── Supprimer les anciens documents (reset propre) ───────────────────
const { error: delErr } = await supabase.from('documents').delete().gte('id', 0)
if (delErr) console.warn('⚠️ Erreur suppression:', delErr.message)
else console.log('🗑️ Anciens documents supprimés')

// ── Importer chunk par chunk avec embedding ──────────────────────────
let success = 0
let failed = 0

for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const label = `[${i + 1}/${chunks.length}] ${chunk.section.slice(0, 40)}`

    try {
        // Générer l'embedding via fetch REST Gemini v1
        const embedding = await getEmbedding(chunk.content)

        // Insérer dans Supabase
        const { error } = await supabase.from('documents').insert({
            content: chunk.content,
            metadata: {
                section: chunk.section,
                is_active: true,
                source: 'blolab_base_informations.md',
                created_at: new Date().toISOString(),
                char_count: chunk.content.length,
            },
            embedding,
        })

        if (error) {
            console.error(`  ❌ ${label} → ${error.message}`)
            failed++
        } else {
            console.log(`  ✅ ${label}`)
            success++
        }

        // Pause pour éviter rate limit Gemini (10 req/s)
        await new Promise(r => setTimeout(r, 200))
    } catch (err) {
        console.error(`  ❌ ${label} → ${err.message}`)
        failed++
        // Pause plus longue en cas d'erreur
        await new Promise(r => setTimeout(r, 1000))
    }
}

console.log(`\n✨ Import terminé : ${success} succès, ${failed} échecs`)
