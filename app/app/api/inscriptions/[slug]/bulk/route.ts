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

        // 1. Récupérer les champs du programme pour le mapping
        const { data: prog, error: progErr } = await supabase
            .from('programmes')
            .select('*, programme_champs(*)')
            .eq('slug', slug)
            .single()

        if (progErr || !prog) throw new Error("Programme introuvable")

        const headerMapping: Record<string, string> = {}
        prog.programme_champs.forEach((f: any) => {
            const safeName = f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
            headerMapping[f.name] = safeName
        })

        // 2. Mapper les lignes du CSV
        const rowsToInsert = rows.map(row => {
            const newRow: any = {}
            
            Object.keys(row).forEach(originalKey => {
                const sqlKey = headerMapping[originalKey] || originalKey.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                newRow[sqlKey] = row[originalKey]
            })

            // WhatsApp / Chat ID logic
            const phoneKeys = Object.keys(newRow).filter(k => 
                k.includes('phone') || k.includes('t_l_phone') || k.includes('tel') || k === 'numero' || k === 'chat_id'
            );
            
            if (!newRow.chat_id) {
                newRow.chat_id = phoneKeys.length > 0 && newRow[phoneKeys[0]] 
                    ? String(newRow[phoneKeys[0]]).replace(/\D/g, '') 
                    : crypto.randomUUID();
            } else {
                newRow.chat_id = String(newRow.chat_id).replace(/\D/g, '')
            }
            
            return newRow
        });

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
