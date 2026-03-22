import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'

export async function POST(req: NextRequest) {
    try {
        const { id, content, metadata } = await req.json()
        if (!id || !content) return NextResponse.json({ error: 'ID et Contenu requis' }, { status: 400 })

        // 1. Régénérer l'embedding (car le texte a changé)
        const embedding = await generateEmbedding(content)
        
        // 2. Mise à jour Supabase
        const supabase = createAdminClient()
        const { error } = await supabase
            .from('documents')
            .update({
                content,
                metadata: {
                    ...metadata,
                    updated_at: new Date().toISOString(),
                },
                embedding,
            })
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error('Erreur update knowledge:', err)
        return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 })
    }
}
