# MED-14 — Restaurer la validation stricte des events webhook

**Sévérité** : Moyenne
**Effort** : S (15 min)

## Contexte

`app/app/api/webhooks/wasender/route.ts:41-42` contient :
```ts
// AUCUNE VERIFICATION STRICTE D'EVENT ICI POUR DEBUG
// (L'ancien bloc validEvents a été retiré temporairement)
```

Le bloc retiré validait que l'event reçu appartient à une liste attendue. Sans lui :
- Un payload malveillant avec un event inconnu passe les checks d'event (lignes 54-66 qui font juste des `if`).
- Risque que WaSenderAPI change son API et envoie un event inattendu qui soit mal traité silencieusement.

## Étapes

### 1. Définir la liste des events attendus

Selon la doc WaSenderAPI et les besoins du projet :
```ts
const VALID_EVENTS = [
    'webhook.test',
    'messages.upsert',
    'messages.received',
    'messages.update',
    'poll.results',
] as const
type ValidEvent = typeof VALID_EVENTS[number]
```

### 2. Valider et journaliser les events inconnus

```ts
const event = payload?.event

if (!event || !VALID_EVENTS.includes(event as ValidEvent)) {
    console.warn(`[Webhook] Event ignoré: ${event}`)
    return NextResponse.json({ ok: true, ignored: true })
}
```

### 3. Retirer le commentaire "DEBUG"

## Critères d'acceptation

- Les events inconnus sont silencieusement ignorés (avec log).
- Les events attendus sont traités normalement.
- Le commentaire "DEBUG" est retiré.

## Dépendances

- CRIT-01 (HMAC validation) — à faire dans le même commit pour cohérence.
