import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createAdminClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

export async function POST(req: NextRequest) {
    const { content, section } = await req.json()
    if (!content) return NextResponse.json({ error: 'Contenu requis' }, { status: 400 })

    // Générer l'embedding via Gemini
    const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
    const result = await embeddingModel.embedContent(content)
    const embedding = result.embedding.values

    // Insérer dans documents
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('documents')
        .insert({
            content,
            metadata: {
                section: section || 'BloLab',
                is_active: true,
                created_at: new Date().toISOString(),
            },
            embedding,
        })
        .select('id')
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
}
