/**
 * Génère un vecteur d'embedding pour un texte donné via l'API REST native de Gemini.
 * On évite le SDK pour contourner les problèmes de "fetch failed" dans certains environnements Next.js.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("Clé API Google (Gemini) manquante.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`;

  try {
    console.log(`[EMBEDDINGS] Requesting embedding for text length: ${text.length}`);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: {
          parts: [{ text }]
        }
      }),
    });

    const json = await res.json() as any;

    if (!res.ok) {
      console.error('[EMBEDDINGS] API Error:', json);
      throw new Error(json.error?.message || "Erreur lors de l'appel à l'API Gemini.");
    }

    if (!json.embedding || !json.embedding.values) {
      throw new Error("Format de réponse invalide de l'API Gemini.");
    }

    console.log('[EMBEDDINGS] Success!');
    return json.embedding.values;
  } catch (error: any) {
    console.error('[EMBEDDINGS] General Error:', error);
    // On relance une erreur simplifiée pour l'UI
    throw new Error(`Echec de la vectorisation : ${error.message || 'Erreur réseau'}`);
  }
}
