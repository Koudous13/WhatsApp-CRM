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
