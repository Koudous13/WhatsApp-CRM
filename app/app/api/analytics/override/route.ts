import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    const supabase = createAdminClient()
    const { data } = await supabase.from('stats_overrides').select('*')
    return NextResponse.json({ overrides: data || [] })
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { metric_key, manual_value, offset_value } = body

        if (!metric_key) {
            return NextResponse.json({ error: 'metric_key requis' }, { status: 400 })
        }

        const supabase = createAdminClient()
        
        const { data, error } = await supabase
            .from('stats_overrides')
            .upsert({ 
                metric_key, 
                manual_value: manual_value !== undefined ? manual_value : null,
                offset_value: offset_value !== undefined ? offset_value : 0,
                updated_at: new Date().toISOString()
            }, { onConflict: 'metric_key' })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
