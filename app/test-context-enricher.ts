/**
 * Test unitaire standalone du context enricher.
 * Usage : npx tsx test-context-enricher.ts
 * Exit 0 = tous les tests passent, exit 1 = au moins un échec.
 */

import { detectKeywords, decideRoute, formatProspectStateForPrompt, type Route, type ProspectState } from './lib/ai/context-enricher'

let passed = 0
let failed = 0
const failures: string[] = []

function assertEqual<T>(actual: T, expected: T, name: string) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    if (ok) {
        passed++
        console.log(`  ✓ ${name}`)
    } else {
        failed++
        const msg = `  ✗ ${name}\n    attendu : ${JSON.stringify(expected)}\n    reçu    : ${JSON.stringify(actual)}`
        failures.push(msg)
        console.log(msg)
    }
}

function assertContains(haystack: string[], needle: string, name: string) {
    const ok = haystack.includes(needle)
    if (ok) {
        passed++
        console.log(`  ✓ ${name}`)
    } else {
        failed++
        const msg = `  ✗ ${name}\n    array : ${JSON.stringify(haystack)}\n    doit contenir : ${needle}`
        failures.push(msg)
        console.log(msg)
    }
}

// ================================================================
console.log('\n🧪 detectKeywords\n')

// Validation inscription offline
assertContains(detectKeywords("J'ai déjà payé à Cotonou"), 'validation_offline', 'détecte "payé"')
assertContains(detectKeywords("On m'a dit d'écrire ici pour valider"), 'validation_offline', 'détecte "on m\'a dit" + "valider"')
assertContains(detectKeywords("J'ai reçu un reçu de paiement"), 'validation_offline', 'détecte "reçu" + "paiement"')
assertContains(detectKeywords("je suis inscrit à votre école"), 'validation_offline', 'détecte "inscrit"')
assertContains(detectKeywords("la dame à la caisse m'a donné votre numéro"), 'validation_offline', 'détecte "caisse"')

// Demande humain
assertContains(detectKeywords("Je veux parler à un conseiller"), 'demande_humain', 'détecte "conseiller"')
assertContains(detectKeywords("Passez-moi le responsable"), 'demande_humain', 'détecte "responsable"')
assertContains(detectKeywords("Vous avez un numéro ?"), 'demande_humain', 'détecte "numéro"')
assertContains(detectKeywords("Je préfère joindre le directeur"), 'demande_humain', 'détecte "directeur"')

// Logistique
assertContains(detectKeywords("Où êtes-vous situés ?"), 'logistique', 'détecte "où êtes"')
assertContains(detectKeywords("Quels sont vos horaires ?"), 'logistique', 'détecte "horaires"')
assertContains(detectKeywords("Vous êtes dans quel quartier ?"), 'logistique', 'détecte "quartier"')

// Intent inscription
assertContains(detectKeywords("Je voudrais m'inscrire à l'école 229"), 'intent_inscription', 'détecte "m\'inscrire"')
assertContains(detectKeywords("Je suis intéressé par ClassTech"), 'intent_inscription', 'détecte "intéressé"')

// Messages neutres (ne doivent rien détecter)
assertEqual(detectKeywords("Bonjour"), [], 'message neutre vide')
assertEqual(detectKeywords("Comment ça va ?"), [], 'message neutre conversationnel')
assertEqual(detectKeywords("C'est quoi BloLab ?"), [], 'question ouverte non-keyword')

// Cross-detection (plusieurs signaux)
const multi = detectKeywords("Je veux parler à un humain, j'ai payé hier")
assertContains(multi, 'demande_humain', 'multi: contient demande_humain')
assertContains(multi, 'validation_offline', 'multi: contient validation_offline')

// ================================================================
console.log('\n🧪 decideRoute — priorité métier\n')

// Priorité 1 : DEMANDE_HUMAIN écrase tout
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: true, hasAnyInscription: true,
        signals: ['demande_humain', 'validation_offline', 'logistique']
    }),
    'DEMANDE_HUMAIN' as Route,
    'DEMANDE_HUMAIN écrase tout'
)

// Priorité 2 : VALIDATION_INSCRIPTION_OFFLINE
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: false, hasAnyInscription: false,
        signals: ['validation_offline']
    }),
    'VALIDATION_INSCRIPTION_OFFLINE' as Route,
    'validation_offline même sans trace en base'
)

// Priorité 3 : ELEVE_ACTIF (a une inscription active, pas de signal spécifique)
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: true, hasAnyInscription: true,
        signals: []
    }),
    'ELEVE_ACTIF' as Route,
    'inscription active → ELEVE_ACTIF'
)

// Priorité 4 : QUESTION_LOGISTIQUE
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: false, hasAnyInscription: false,
        signals: ['logistique']
    }),
    'QUESTION_LOGISTIQUE' as Route,
    'signal logistique seul'
)

// Priorité 5 : PROSPECT_CONNU_RETOUR (prénom connu, rien d'autre)
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: false, hasAnyInscription: false,
        signals: []
    }),
    'PROSPECT_CONNU_RETOUR' as Route,
    'prénom connu sans autre signal'
)

// Cas spécial : pas de prénom mais a une inscription (bizarre, mais on a son numéro)
assertEqual(
    decideRoute({
        hasProfil: false, hasPrenom: false, hasActiveInscription: false, hasAnyInscription: true,
        signals: []
    }),
    'PROSPECT_CONNU_RETOUR' as Route,
    'a une inscription sans prénom → connu'
)

// Priorité 6 : NOUVEAU_PROSPECT (rien de rien)
assertEqual(
    decideRoute({
        hasProfil: false, hasPrenom: false, hasActiveInscription: false, hasAnyInscription: false,
        signals: []
    }),
    'NOUVEAU_PROSPECT' as Route,
    'aucun signal → nouveau prospect'
)

// Edge case : prénom connu + signal validation → c'est VALIDATION, pas CONNU_RETOUR
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: false, hasAnyInscription: false,
        signals: ['validation_offline']
    }),
    'VALIDATION_INSCRIPTION_OFFLINE' as Route,
    'prénom connu + validation → VALIDATION prime'
)

// Edge case : élève actif qui demande un humain → DEMANDE_HUMAIN prime
assertEqual(
    decideRoute({
        hasProfil: true, hasPrenom: true, hasActiveInscription: true, hasAnyInscription: true,
        signals: ['demande_humain']
    }),
    'DEMANDE_HUMAIN' as Route,
    'élève actif demandant humain → DEMANDE_HUMAIN prime'
)

// ================================================================
console.log('\n🧪 formatProspectStateForPrompt — smoke test\n')

const sampleState: ProspectState = {
    known_prenom: 'Fatou',
    known_nom: null,
    profil_type: 'Etudiant',
    nombre_interactions: 7,
    days_since_first_contact: 12,
    days_since_last_message: 3,
    last_statut_conversation: 'Qualifie',
    has_active_inscription: false,
    inscriptions: [{ slug: 'ecole229', status: 'pending' }],
    intent_keywords: ['validation_offline'],
    suggested_route: 'VALIDATION_INSCRIPTION_OFFLINE',
}
const formatted = formatProspectStateForPrompt(sampleState)
assertEqual(formatted.includes('ROUTE SUGGÉRÉE PAR LE SYSTÈME : VALIDATION_INSCRIPTION_OFFLINE'), true, 'format : contient la route')
assertEqual(formatted.includes('Prénom : Fatou'), true, 'format : contient le prénom')
assertEqual(formatted.includes('ecole229 (status=pending)'), true, 'format : contient l\'inscription')
assertEqual(formatted.includes('validation_offline'), true, 'format : contient les signaux')

// État minimal (nouveau prospect pur)
const emptyState: ProspectState = {
    known_prenom: null,
    known_nom: null,
    profil_type: null,
    nombre_interactions: 0,
    days_since_first_contact: null,
    days_since_last_message: null,
    last_statut_conversation: null,
    has_active_inscription: false,
    inscriptions: [],
    intent_keywords: [],
    suggested_route: 'NOUVEAU_PROSPECT',
}
const emptyFormatted = formatProspectStateForPrompt(emptyState)
assertEqual(emptyFormatted.includes('(inconnu)'), true, 'format vide : affiche (inconnu)')
assertEqual(emptyFormatted.includes('(aucune inscription en base)'), true, 'format vide : affiche aucune inscription')
assertEqual(emptyFormatted.includes('(aucun signal particulier)'), true, 'format vide : affiche aucun signal')

// ================================================================
console.log('\n' + '═'.repeat(60))
console.log(`Résultat : ${passed} passés, ${failed} échoués`)
console.log('═'.repeat(60))

if (failed > 0) {
    console.log('\nÉchecs :')
    failures.forEach(f => console.log(f))
    process.exit(1)
}
process.exit(0)
