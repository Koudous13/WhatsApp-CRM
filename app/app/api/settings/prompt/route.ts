import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { BLOLAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'

/**
 * GET: Récupère le prompt système dynamique.
 * Fallback sur le prompt codé en dur si rien n'est en base.
 */
export async function GET() {
    const supabase = createAdminClient()
    
    try {
        const { data: config, error } = await supabase
            .from('config')
            .select('value')
            .eq('key', 'system_prompt')
            .maybeSingle()

        if (error) {
            // Tentative de création si la table manque
            if (error.message.includes('relation "config" does not exist')) {
                try {
                    await supabase.rpc('admin_execute_sql', {
                        sql_query: `
                            CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT now());
                            INSERT INTO config (key, value) VALUES ('system_prompt', $PROMPT$${BLOLAB_SYSTEM_PROMPT}$PROMPT$) ON CONFLICT DO NOTHING;
                        `
                    })
                } catch (e) { console.error('Silent SQL Error:', e) }
                return NextResponse.json({ value: BLOLAB_SYSTEM_PROMPT, isDefault: true })
            }
            // En cas d'autre erreur (ex: permissions), on renvoie quand même le défaut pour ne pas bloquer l'UI
            return NextResponse.json({ value: BLOLAB_SYSTEM_PROMPT, isDefault: true, error: error.message })
        }

        // Si la ligne est vide ou inexistante (null)
        const finalValue = config?.value || BLOLAB_SYSTEM_PROMPT
        return NextResponse.json({ 
            value: finalValue, 
            isDefault: (finalValue === BLOLAB_SYSTEM_PROMPT)
        })
    } catch (err: any) {
        console.error('Settings API Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

/**
 * POST: Met à jour le prompt système dynamique.
 */
export async function POST(req: Request) {
    try {
        const { value } = await req.json()
        if (!value) throw new Error('Contenu du prompt manquant')

        const supabase = createAdminClient()

        const { error } = await supabase
            .from('config')
            .upsert({ 
                key: 'system_prompt', 
                value, 
                updated_at: new Date().toISOString() 
            })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
