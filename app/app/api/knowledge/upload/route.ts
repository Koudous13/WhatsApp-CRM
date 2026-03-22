import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'
import mammoth from 'mammoth'

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData()
        const file = formData.get('file') as File
        const section = formData.get('section') as string || 'Upload Fichier'

        if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })

        const buffer = Buffer.from(await file.arrayBuffer())
        let text = ''

        const ext = file.name.split('.').pop()?.toLowerCase()

        if (ext === 'docx') {
            const result = await mammoth.extractRawText({ buffer })
            text = result.value
        } else if (ext === 'txt' || ext === 'md' || ext === 'csv') {
            text = buffer.toString('utf-8')
        } else {
            return NextResponse.json({ error: 'Format non supporté (.docx, .txt, .md uniquement)' }, { status: 400 })
        }

        if (!text || text.trim().length < 10) {
          throw new Error("Echec de l'extraction de texte ou fichier vide.")
        }

        const finalContent = text.substring(0, 5000) 
        const embedding = await generateEmbedding(finalContent)

        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('documents')
            .insert({
                content: finalContent,
                metadata: {
                    section,
                    filename: file.name,
                    is_active: true,
                    created_at: new Date().toISOString(),
                },
                embedding,
            })
            .select('id')
            .single()

        if (error) throw error
        return NextResponse.json({ ok: true, id: data.id, filename: file.name })
    } catch (err: any) {
        console.error('Erreur upload knowledge:', err)
        return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 })
    }
}
