import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params
        const { rows } = await req.json()
        
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: 'Aucune donnée à importer' }, { status: 400 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        // Pour chaque ligne, si pas de chat_id, on en génère un ou on en récupère un des numéros de téléphone fournis
        const rowsToInsert = rows.map(row => {
            const phoneKeys = Object.keys(row).filter(k => 
                k.toLowerCase().includes('phone') || 
                k.toLowerCase().includes('téléphone') || 
                k.toLowerCase().includes('tel') || 
                k.toLowerCase() === 'numero'
            );
            
            const defaultChatId = phoneKeys.length > 0 && row[phoneKeys[0]] 
                ? String(row[phoneKeys[0]]) 
                : crypto.randomUUID();
            
            return {
                ...row,
                chat_id: row.chat_id || defaultChatId,
            }
        });

        // Utilisation de count="exact" ou simplement insert normal. 
        // Si un chat_id est dupliqué, on peut utiliser upsert pour mettre à jour
        const { data, error } = await supabase
            .from(tableName)
            .upsert(rowsToInsert, { onConflict: 'chat_id' })
            .select()

        if (error) throw error

        return NextResponse.json({ success: true, count: data.length, data })
    } catch (error: any) {
        console.error(`Erreur POST /api/inscriptions/${await params.then(p => p.slug)}/bulk:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
