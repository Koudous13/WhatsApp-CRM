import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

interface ProfilProspectsUpdate {
    prenom?: string
    nom?: string
    age?: string
    telephone?: string
    email?: string
    ville?: string
    persona?: string
    persona_nom?: string
    profil_type?: string
    secteur_activite?: string
    statut_professionnel?: string
    ambition?: string
    frustration_principale?: string
    aspiration?: string
    interet_principal?: string
    centres_interet?: string
    objectif?: string
    niveau_actuel?: string
    disponibilite?: string
    equipement?: string
    budget_mentionne?: string
    budget_fourchette?: string
    programme_recommande?: string
    programme_interesse?: string
    paiement_prefere?: string
    objections?: string
    objection_principale?: string
    niveau_confiance?: string
    statut_conversation?: string
    etape_parcours?: string
    score_engagement?: number
    tendance_engagement?: string
    niveau_urgence?: string
    niveau_motivation?: string
    tags_ia?: string
    sentiment_global?: string
    derniere_analyse_ia?: string
    notes_auto?: string
}

export async function extractLeadProfile(
    userMessage: string,
    aiResponse: string,
    existingContact: any
): Promise<ProfilProspectsUpdate> {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `Tu es un système d'extraction de données CRM. Analyse cet échange WhatsApp et retourne UNIQUEMENT un objet JSON avec les données extraites.

Profil actuel connu :
${JSON.stringify(existingContact ?? {}, null, 2)}

Message utilisateur : "${userMessage}"
Réponse assistant : "${aiResponse}"

Règles :
- Retourne SEULEMENT les champs déductibles de CET échange
- N'invente rien, omets les champs incertains
- score_engagement: 0-100 (80+ = prêt à s'inscrire, 50-79 = intéressé, 0-49 = froid)
- tags_ia: JSON array stringifié ex: ["parent", "urgent", "ClassTech"]
- Retourne UNIQUEMENT le JSON brut, sans balises markdown

Champs disponibles : prenom, nom, age, telephone, email, ville, persona, persona_nom, profil_type, secteur_activite, statut_professionnel, ambition, frustration_principale, aspiration, interet_principal, centres_interet, objectif, niveau_actuel ("Débutant"|"Quelques bases"|"Intermédiaire"|"Avancé"), disponibilite, equipement, budget_mentionne, budget_fourchette, programme_recommande ("ClassTech"|"Ecole229"|"KMC"|"Incubateur"|"FabLab"), programme_interesse, paiement_prefere, objections, objection_principale, niveau_confiance, statut_conversation ("Nouveau"|"Qualifie"|"Proposition faite"|"Interesse"|"Inscription"|"Froid"), etape_parcours, score_engagement (0-100), tendance_engagement, niveau_urgence ("Faible"|"Moyen"|"Élevé"), niveau_motivation ("Faible"|"Moyen"|"Élevé"), tags_ia, sentiment_global ("positif"|"neutre"|"négatif"), derniere_analyse_ia, notes_auto`

    try {
        const result = await model.generateContent(prompt)
        const jsonText = result.response.text()
            .replace(/```json/g, '').replace(/```/g, '').trim()
        return JSON.parse(jsonText)
    } catch {
        return {}
    }
}
