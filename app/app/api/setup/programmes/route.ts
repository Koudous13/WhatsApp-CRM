import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // Nous utilisons 'admin_execute_sql' pour créer les tables mères avec le service role key.
        // uuid_generate_v4() nécessite l'extension "uuid-ossp".
        const sql = `
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

            CREATE TABLE IF NOT EXISTS programmes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMPTZ DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS programme_champs (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                programme_id UUID REFERENCES programmes(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                options JSONB,
                is_required BOOLEAN DEFAULT true,
                display_order INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        `

        const { error } = await supabase.rpc('admin_execute_sql', { sql_query: sql })

        if (error) {
            console.error("Erreur lors de la création des tables programmes:", error)
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: "Tables programmes et programme_champs créées avec succès." })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
