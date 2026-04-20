/** Envoie une alerte dans le groupe Telegram de l'équipe BloLab */
export async function sendTelegramAlert(message: string): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_ALERT_CHAT_ID

    if (!botToken || !chatId) {
        console.warn('[Telegram] Variables non configurées, alerte ignorée')
        return
    }

    try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
            }),
        })
    } catch (err) {
        console.error('[Telegram] Erreur envoi alerte:', err)
    }
}

/** Formatte l'alerte handover humain (escalade) */
export function buildHandoverAlert(params: {
    raison: string
    urgence?: 'normal' | 'urgent'
    prenom?: string | null
    chat_id: string
    contexte?: string
    programme?: string | null
}) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://whatsapp-crm-blolabparakou.vercel.app'
    const inboxUrl = `${appUrl}/inbox?chat_id=${params.chat_id}`
    const prefix = params.urgence === 'urgent' ? '🚨 *URGENT — HANDOVER HUMAIN*' : '🙋 *Handover humain demandé*'

    const lines = [
        prefix,
        '',
        `📌 *Raison:* ${params.raison}`,
    ]
    if (params.prenom) lines.push(`👤 *Prénom:* ${params.prenom}`)
    if (params.programme) lines.push(`🎯 *Programme:* ${params.programme}`)
    lines.push(`📱 *WhatsApp:* ${params.chat_id}`)
    if (params.contexte) lines.push(`📝 *Contexte:* ${params.contexte}`)
    lines.push('', `👉 [Ouvrir la conversation Inbox](${inboxUrl})`)

    return lines.join('\n')
}

/** Formatte l'alerte lead chaud */
export function buildLeadChaudAlert(params: {
    prenom?: string
    profil_type?: string
    programme_recommande?: string
    etape_parcours?: string
    score_engagement?: number
    chat_id: string
}) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://whatsapp-crm-blolabparakou.vercel.app'
    const inboxUrl = `${appUrl}/inbox?chat_id=${params.chat_id}`

    return (
        `🔥 *LEAD CHAUD — BloLab CRM*\n\n` +
        `👤 *Prénom:* ${params.prenom ?? 'Inconnu'}\n` +
        `🏷️ *Profil:* ${params.profil_type ?? '-'}\n` +
        `🎯 *Programme:* ${params.programme_recommande ?? '-'}\n` +
        `📍 *Étape:* ${params.etape_parcours ?? 'Découverte'}\n` +
        `📊 *Score:* ${params.score_engagement ?? 0}/100\n` +
        `📱 *WhatsApp:* ${params.chat_id}\n\n` +
        `👉 [Ouvrir la conversation Inbox](${inboxUrl})`
    )
}
