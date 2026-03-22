-- ============================================================
-- Migration : Table Smart_Segments
-- Copiez-collez ce SQL dans l'éditeur SQL Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public."Smart_Segments" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    filters JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS
ALTER TABLE public."Smart_Segments" ENABLE ROW LEVEL SECURITY;

-- Politique d'accès (toutes les opérations autorisées)
DROP POLICY IF EXISTS "Allow all for Smart_Segments" ON public."Smart_Segments";
CREATE POLICY "Allow all for Smart_Segments"
    ON public."Smart_Segments"
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Vérification
SELECT 'Table Smart_Segments créée avec succès ✅' AS status;
