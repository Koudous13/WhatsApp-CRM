import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const migrationSql = `
            ALTER TABLE programme_champs ADD COLUMN IF NOT EXISTS question_label TEXT;
        `
        const { error } = await supabase.rpc('admin_execute_sql', { sql_query: migrationSql })
        
        if (error) throw error

        return NextResponse.json({ success: true, message: 'Migration réussie : colonne question_label ajoutée à programme_champs.' })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
