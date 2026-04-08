/** Client WaSenderAPI — envoi de messages WhatsApp */

const BASE_URL = 'https://wasenderapi.com/api'
const API_KEY = process.env.WASENDER_API_KEY!

async function wasenderFetch(path: string, body: object) {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`WaSenderAPI error ${res.status}: ${err}`)
    }

    return res.json()
}

/** Envoie un message texte à un numéro WhatsApp */
export async function sendWhatsAppMessage(to: string, text: string) {
    return wasenderFetch('/send-message', { to, text })
}

/** Envoie une réaction emoji à un message */
export async function sendWhatsAppReaction(to: string, messageId: string, emoji: string) {
    return wasenderFetch('/send-reaction', { to, messageId, emoji })
}

/** Envoie un poll (sondage) WhatsApp natif à un numéro */
export async function sendWhatsAppPoll(to: string, question: string, options: string[], multiSelect: boolean = false) {
    return wasenderFetch('/send-message', {
        to,
        poll: { question, options, multiSelect }
    })
}

/** Vérifie le statut de la session WhatsApp */
export async function getSessionStatus() {
    const res = await fetch(`${BASE_URL}/session-status`, {
        headers: { 'Authorization': `Bearer ${API_KEY}` },
    })
    return res.json()
}
