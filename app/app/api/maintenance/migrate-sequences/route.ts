import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
    const supabase = createAdminClient()
    const sql = `
        CREATE TABLE IF NOT EXISTS broadcast_sequences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name TEXT NOT NULL,
            programme_nom TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES broadcast_sequences(id) ON DELETE CASCADE;
        ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS sequence_step_index INT;
    `;
    
    const { error } = await supabase.rpc('admin_execute_sql', { query: sql })
    if (error) {
        // Fallback si admin_execute_sql n'existe pas, on tente via un workaround ou on retourne l'erreur
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
}
