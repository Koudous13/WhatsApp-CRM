# HIGH-06 — Décision LLM : DeepSeek (code) vs Gemini (spec)

**Sévérité** : Haute (divergence produit)
**Effort** : M (4h pour décision + fallback)
**Finding parent** : `AUDIT.md` §3.HIGH-06

## Contexte

Le code utilise **DeepSeek** comme LLM principal (via le SDK OpenAI avec `baseURL: https://api.deepseek.com`). La spec technique `TECH_SPEC/01_STACK_ARCHITECTURE.md` et `04_WORKFLOW_RAG_IA.md` annoncent **Gemini 2.0 Flash** avec fallback GPT-4o-mini.

Conséquences :
- Aucun fallback configuré : si DeepSeek tombe, tout l'agent tombe.
- `GOOGLE_GENERATIVE_AI_API_KEY` est configuré dans l'env mais utilisé uniquement pour les embeddings.
- `openai` est installé en dépendance mais utilisé uniquement comme SDK pour DeepSeek.
- Coût, performance et qualité linguistique (français africain) non documentés pour DeepSeek.

## Fichiers concernés

- `app/lib/ai/rag-pipeline.ts:8-11`
- `TECH_SPEC/01_STACK_ARCHITECTURE.md`
- `TECH_SPEC/04_WORKFLOW_RAG_IA.md`
- `app/package.json` (dépendances `openai`, `@google/generative-ai`)

## Décision produit à prendre

**Option A — Rester sur DeepSeek**
- Avantages : coûts réduits, déjà fonctionnel, historique des tests.
- Inconvénients : qualité en français africain à valider, sensible à la disponibilité du provider.
- Action : mettre à jour la spec.

**Option B — Basculer sur Gemini 2.0 Flash**
- Avantages : conforme à la spec, meilleur support linguistique (Google parle mieux les langues africaines francophones), intégration native Vercel.
- Inconvénients : plus cher, migration des prompts et tools.
- Action : réécriture du pipeline RAG.

**Option C — Mode dual avec fallback**
- Gemini principal, DeepSeek fallback (ou inverse).
- Avantages : haute dispo, comparaison des coûts en prod.
- Inconvénients : complexité supplémentaire.

## Étapes (Option C recommandée)

### 1. Créer une abstraction provider

```ts
// lib/ai/providers/types.ts
export interface LLMProvider {
    name: string
    chatCompletion(params: {
        messages: ChatMessage[]
        tools?: Tool[]
        temperature?: number
    }): Promise<LLMResponse>
}
```

### 2. Implémenter les deux providers

- `lib/ai/providers/gemini.ts` — utilise `@google/generative-ai` avec gestion des tools.
- `lib/ai/providers/deepseek.ts` — wrapper sur le SDK OpenAI.

### 3. Dispatcher avec fallback

```ts
// lib/ai/providers/index.ts
import { geminiProvider } from './gemini'
import { deepseekProvider } from './deepseek'

export async function callLLM(params: ...) {
    try {
        return await geminiProvider.chatCompletion(params)
    } catch (err) {
        console.warn('[LLM] Gemini failed, falling back to DeepSeek', err)
        await sendTelegramAlert(`LLM fallback triggered: ${err}`)
        return await deepseekProvider.chatCompletion(params)
    }
}
```

### 4. Migrer `rag-pipeline.ts`

Remplacer les appels directs à `openai.chat.completions.create()` par `callLLM()`.

### 5. Tester

- Tester les 7 outils (search_blolab_knowledge, manage_crm_profile, etc.) avec chaque provider.
- Mesurer latence et coût moyen par réponse.

### 6. Mettre à jour la doc

- `TECH_SPEC/01_STACK_ARCHITECTURE.md` : documenter les deux providers.
- `AUDIT.md` : retirer HIGH-06.
- `app/.env.example` : les deux clés requises.

## Critères d'acceptation

- Le pipeline RAG fonctionne avec Gemini en principal.
- Si Gemini est down (tester en mettant une mauvaise clé temporairement), le fallback DeepSeek répond.
- Les 7 tools fonctionnent sur les deux providers.
- Une alerte Telegram est envoyée au fallback.
- Spec et code sont alignés.

## Dépendances

- Aucune technique. Impact fort sur les coûts donc à évaluer avec la décision produit.
