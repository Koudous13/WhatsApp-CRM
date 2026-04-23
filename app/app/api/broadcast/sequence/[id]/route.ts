import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const sequenceId = params.id
        if (!sequenceId) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

        const supabase = createAdminClient()

        // 1. Annuler tous les broadcasts encore planifiés
        await supabase
            .from('broadcasts')
            .update({ status: 'canceled' })
            .eq('sequence_id', sequenceId)
            .eq('status', 'scheduled')

        // 2. Supprimer la séquence (optionnel, ou juste annuler)
        // Mais la foreign key ON DELETE CASCADE supprimerait tous les broadcasts (même les running). 
        // Donc on ne supprime PAS la séquence, on change juste le nom ou on la marque annulée si on veut.
        // Puisqu'on n'a pas de colonne status sur la séquence, l'action "Supprimer la séquence" 
        // va simplement mettre tous ses broadcasts scheduled à canceled.
        
        return NextResponse.json({ ok: true })

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
