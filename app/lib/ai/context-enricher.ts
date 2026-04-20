import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Context Enricher — calcule l'état prospect complet avant le pipeline RAG.
 *
 * Injecte dans le system prompt un bloc "ÉTAT PROSPECT" fiable pour que
 * l'IA puisse router correctement la conversation sans redemander ce qu'elle sait.
 */

export type Route =
    | 'NOUVEAU_PROSPECT'
    | 'PROSPECT_CONNU_RETOUR'
    | 'VALIDATION_INSCRIPTION_OFFLINE'
    | 'ELEVE_ACTIF'
    | 'QUESTION_LOGISTIQUE'
    | 'DEMANDE_HUMAIN'
    | 'FALLBACK'

export interface InscriptionEntry {
    slug: string
    status: string
}

export interface ProspectState {
    known_prenom: string | null
    known_nom: string | null
    profil_type: string | null
    nombre_interactions: number
    days_since_first_contact: number | null
    days_since_last_message: number | null
    last_statut_conversation: string | null
    has_active_inscription: boolean
    inscriptions: InscriptionEntry[]
    intent_keywords: string[]
    suggested_route: Route
}

// --- Regex de détection des signaux textuels ---------------------------
// Précompilées pour la perf, insensibles à la casse.
// Note : on n'utilise PAS de \b en fin de pattern car JS `\b` est ASCII-only
// et échoue sur les mots se terminant par un accent (payé, intéressé, etc.).
// Les patterns sont assez spécifiques pour éviter les faux positifs.

const KEYWORDS_VALIDATION = /(?:^|[^a-zA-ZÀ-ÿ])(pay[ée]+|payer|paiement|re[çc]u|validation|valider|valid[ée]+|inscrit[e]?|on m'a (dit|demand[ée]+|envoy[ée]+|orient[ée]+)|caisse|agent|venir valider|d[ée]j[àa] (pay[ée]+|inscrit[e]?))/i
const KEYWORDS_HUMAIN = /(?:^|[^a-zA-ZÀ-ÿ])(humain|personne|conseiller|responsable|directeur|directrice|appeler|t[ée]l[ée]phone|parler (à|avec) (quelqu'un|un|une)|num[ée]ro|joindre|contact direct)/i
const KEYWORDS_LOGISTIQUE = /(?:^|[^a-zA-ZÀ-ÿ])(o[uù]\s+[êe]tes|adresse|situ[ée]+|localis[ée]+|horaires?|ouvert|ferm[ée]+|venir|chemin|quartier|google ?map|localisation|lieu)/i
const KEYWORDS_INSCRIPTION_INTENT = /(?:^|[^a-zA-ZÀ-ÿ])(je (veux|voudrais|souhaite) (m'inscrire|m inscrire|inscrire|commencer|suivre)|je m'inscris|je m inscris|inscription|inscrire|int[ée]ress[ée]+)/i

export function detectKeywords(text: string): string[] {
    const signals: string[] = []
    if (KEYWORDS_VALIDATION.test(text)) signals.push('validation_offline')
    if (KEYWORDS_HUMAIN.test(text)) signals.push('demande_humain')
    if (KEYWORDS_LOGISTIQUE.test(text)) signals.push('logistique')
    if (KEYWORDS_INSCRIPTION_INTENT.test(text)) signals.push('intent_inscription')
    return signals
}

/**
 * Liste les tables inscript_* réellement présentes en base.
 * Évite un UNION qui planterait si une table n'existe pas.
 */
async function listInscriptionTables(supabase: SupabaseClient): Promise<string[]> {
    try {
        const sql = `
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name LIKE 'inscript\\_%' ESCAPE '\\'
        `
        const { data, error } = await supabase.rpc('admin_execute_sql', { sql_query: sql })
        if (error || !data) return []
        const rows = Array.isArray(data) ? data : JSON.parse(data as any)
        return rows.map((r: any) => r.table_name || r['table_name']).filter(Boolean)
    } catch (err) {
        console.warn('[enricher] listInscriptionTables failed:', err)
        return []
    }
}

/**
 * Cherche l'utilisateur dans toutes les tables inscript_* en une seule requête UNION ALL.
 */
async function fetchInscriptions(
    supabase: SupabaseClient,
    chatId: string,
    tables: string[]
): Promise<InscriptionEntry[]> {
    if (tables.length === 0) return []
    try {
        const safeChat = chatId.replace(/'/g, "''")
        const unionSql = tables
            .map(t => {
                const safeTable = t.replace(/[^a-zA-Z0-9_]/g, '')
                const slug = safeTable.replace(/^inscript_/, '')
                return `SELECT '${slug}' AS slug, status FROM "${safeTable}" WHERE chat_id = '${safeChat}'`
            })
            .join(' UNION ALL ')

        const { data, error } = await supabase.rpc('admin_execute_sql', { sql_query: unionSql })
        if (error || !data) return []
        const rows = Array.isArray(data) ? data : JSON.parse(data as any)
        return rows
            .map((r: any) => ({ slug: r.slug, status: r.status ?? 'unknown' }))
            .filter((e: InscriptionEntry) => e.slug)
    } catch (err) {
        console.warn('[enricher] fetchInscriptions failed:', err)
        return []
    }
}

function computeDaysSince(iso: string | null | undefined): number | null {
    if (!iso) return null
    const diff = Date.now() - new Date(iso).getTime()
    if (isNaN(diff)) return null
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

/**
 * Décision déterministe du routage en fonction du profil et des signaux textuels.
 * L'ordre des branches traduit la priorité métier.
 */
export function decideRoute(params: {
    hasProfil: boolean
    hasPrenom: boolean
    hasActiveInscription: boolean
    hasAnyInscription: boolean
    signals: string[]
}): Route {
    const { hasPrenom, hasActiveInscription, hasAnyInscription, signals } = params

    if (signals.includes('demande_humain')) return 'DEMANDE_HUMAIN'
    if (signals.includes('validation_offline')) return 'VALIDATION_INSCRIPTION_OFFLINE'
    if (hasActiveInscription) return 'ELEVE_ACTIF'
    if (signals.includes('logistique')) return 'QUESTION_LOGISTIQUE'
    if (hasPrenom || hasAnyInscription) return 'PROSPECT_CONNU_RETOUR'
    return 'NOUVEAU_PROSPECT'
}

export async function enrichContext(
    chatId: string,
    text: string,
    supabase: SupabaseClient
): Promise<ProspectState> {
    const [{ data: profil }, tables] = await Promise.all([
        supabase
            .from('Profil_Prospects')
            .select('prenom, nom, profil_type, statut_conversation, nombre_interactions, created_at, date_derniere_activite')
            .eq('chat_id', chatId)
            .maybeSingle(),
        listInscriptionTables(supabase),
    ])

    const inscriptions = await fetchInscriptions(supabase, chatId, tables)
    const signals = detectKeywords(text)

    const hasActiveInscription = inscriptions.some(
        i => i.status && !['pending', 'abandoned', 'cancelled'].includes(i.status.toLowerCase())
    )

    const route = decideRoute({
        hasProfil: !!profil,
        hasPrenom: !!profil?.prenom,
        hasActiveInscription,
        hasAnyInscription: inscriptions.length > 0,
        signals,
    })

    return {
        known_prenom: profil?.prenom ?? null,
        known_nom: profil?.nom ?? null,
        profil_type: profil?.profil_type ?? null,
        nombre_interactions: profil?.nombre_interactions ?? 0,
        days_since_first_contact: computeDaysSince(profil?.created_at),
        days_since_last_message: computeDaysSince(profil?.date_derniere_activite),
        last_statut_conversation: profil?.statut_conversation ?? null,
        has_active_inscription: hasActiveInscription,
        inscriptions,
        intent_keywords: signals,
        suggested_route: route,
    }
}

/**
 * Formate l'état prospect en un bloc texte injecté dans le system prompt.
 * Ton neutre, lecture rapide par le LLM, pas de markdown décoratif.
 */
export function formatProspectStateForPrompt(state: ProspectState): string {
    const inscriptionsTxt = state.inscriptions.length > 0
        ? state.inscriptions.map(i => `  - ${i.slug} (status=${i.status})`).join('\n')
        : '  - (aucune inscription en base)'

    const signalsTxt = state.intent_keywords.length > 0
        ? state.intent_keywords.join(', ')
        : '(aucun signal particulier)'

    return [
        '',
        '═══════════════════════════════════════════════════════════════',
        '## 🧭 ÉTAT PROSPECT (calculé automatiquement — FIABLE, toujours à jour)',
        '',
        `ROUTE SUGGÉRÉE PAR LE SYSTÈME : ${state.suggested_route}`,
        '',
        'Identité déjà connue :',
        `  - Prénom : ${state.known_prenom ?? '(inconnu)'}`,
        `  - Nom : ${state.known_nom ?? '(inconnu)'}`,
        `  - Type de profil : ${state.profil_type ?? '(inconnu)'}`,
        '',
        'Historique :',
        `  - Nombre d'interactions précédentes : ${state.nombre_interactions}`,
        `  - Premier contact il y a : ${state.days_since_first_contact ?? 'N/A'} jour(s)`,
        `  - Dernière activité il y a : ${state.days_since_last_message ?? 'N/A'} jour(s)`,
        `  - Dernier statut conversation : ${state.last_statut_conversation ?? '(aucun)'}`,
        '',
        'Inscriptions détectées :',
        inscriptionsTxt,
        '',
        `Signaux détectés dans le dernier message : ${signalsTxt}`,
        '═══════════════════════════════════════════════════════════════',
        '',
    ].join('\n')
}
