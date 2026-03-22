import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || ''
})

export async function GET() {
    try {
        const supabase = createAdminClient()
        const today = new Date().toISOString().split('T')[0]

        // Récupérer quelques stats de base pour nourrir l'IA
        const [
            { count: newToday },
            { count: escalations },
            { count: inscrits }
        ] = await Promise.all([
            supabase.from('Profil_Prospects').select('*', { count: 'exact', head: true }).gte('created_at', today),
            supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('status', 'escalated'),
            supabase.from('Inscriptions').select('*', { count: 'exact', head: true })
        ])

        const prompt = `Tu es l'assistant personnel du CEO de BloLab.
Voici les statistiques actuelles :
- Nouveaux leads aujourd'hui : ${newToday || 0}
- Conversations nécessitant une intervention humaine urgente : ${escalations || 0}
- Total des inscriptions : ${inscrits || 0}

Rédige un "briefing matinal" très court (2 à 3 phrases maximum) du type "Bonjour Boss. Le business est en croissance. L'IA a qualifié X leads mais Y conversations attendent votre aide."
Le ton doit être très professionnel, rassurant, et orienté action. Ne dis pas "Bonjour CEO", dis "Bonjour Boss" ou "Bonjour".`

        const completion = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.7
        })

        const briefing = completion.choices[0]?.message?.content || "Bonjour Boss. Les systèmes sont opérationnels, mais je n'ai pas pu générer le rapport détaillé."

        return NextResponse.json({ briefing })
    } catch (error: any) {
        console.error("Erreur météo IA:", error)
        return NextResponse.json({ briefing: "Bonjour Boss. Analyse en cours..." })
    }
}
