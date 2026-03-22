import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'
import * as cheerio from 'cheerio'

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json()
        if (!url) return NextResponse.json({ error: 'URL requise' }, { status: 400 })

        // 1. Scraping du contenu
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Erreur lors du chargement de la page: ${response.status}`)
        const html = await response.text()
        const $ = cheerio.load(html)

        // On enlève les scripts, styles et nav
        $('script, style, nav, footer, header').remove()
        
        // Extraction du texte principal (body ou article)
        let content = $('article').text() || $('main').text() || $('body').text()
        content = content.replace(/\s\s+/g, ' ').trim() // Nettoyage espaces

        if (content.length < 50) {
            throw new Error("Contenu extrait trop court ou protégé.")
        }

        // Limiter à 4000 caractères pour Gemini (simple chunking pour l'instant)
        const finalContent = content.substring(0, 4000)

        // 2. Vectorisation
        const embedding = await generateEmbedding(finalContent)

        // 3. Stockage Supabase
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('documents')
            .insert({
                content: finalContent,
                metadata: {
                    section: 'Scraping Web',
                    source: url,
                    is_active: true,
                    created_at: new Date().toISOString(),
                },
                embedding,
            })
            .select('id')
            .single()

        if (error) throw error
        return NextResponse.json({ ok: true, id: data.id, title: $('title').text() })
    } catch (err: any) {
        console.error('Erreur scrape knowledge:', err)
        return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 })
    }
}
