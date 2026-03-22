import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const BASE_URL = 'https://wasenderapi.com/api'
const API_KEY = process.env.WASENDER_API_KEY!

/** Route de diagnostic pour tester l'envoi WhatsApp */
export async function POST(req: NextRequest) {
    const { to, text } = await req.json()

    if (!to || !text) {
        return NextResponse.json({ error: 'to et text requis' }, { status: 400 })
    }

    // Log l'API key (masquée)
    const keyInfo = API_KEY 
        ? `Présente (${API_KEY.substring(0, 8)}...)` 
        : 'ABSENTE ❌'

    console.log(`[Test WaSender] to="${to}" key=${keyInfo}`)

    try {
        const res = await fetch(`${BASE_URL}/send-message`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, text }),
        })

        const responseText = await res.text()
        let responseJson: any = null
        try { responseJson = JSON.parse(responseText) } catch {}

        console.log(`[Test WaSender] Status: ${res.status}, Body: ${responseText}`)

        return NextResponse.json({
            status: res.status,
            ok: res.ok,
            apiKey: keyInfo,
            payload: { to, text },
            response: responseJson || responseText,
        })
    } catch (err: any) {
        console.error('[Test WaSender] Exception:', err)
        return NextResponse.json({
            error: err.message,
            apiKey: keyInfo,
            payload: { to, text },
        }, { status: 500 })
    }
}

/** Récupère les dernières campagnes avec leurs stats */
export async function GET() {
    const supabase = createAdminClient()
    const { data: campaigns, error } = await supabase
        .from('broadcasts')
        .select('id, name, status, total_recipients, sent_count, delivered_count, failed_count, created_at, sent_at')
        .order('created_at', { ascending: false })
        .limit(5)

    // Vérifie aussi un prospect au hasard pour voir le format de chat_id
    const { data: prospect } = await supabase
        .from('Profil_Prospects')
        .select('chat_id, prenom, opt_in')
        .eq('opt_in', true)
        .limit(1)
        .single()

    return NextResponse.json({
        apiKey: API_KEY ? `${API_KEY.substring(0, 8)}...` : 'ABSENTE',
        campaigns: campaigns || [],
        sampleProspect: prospect || null,
        error: error?.message,
    })
}
