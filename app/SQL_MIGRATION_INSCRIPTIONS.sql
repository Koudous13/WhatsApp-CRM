-- ============================================================
-- Migration : Table Inscriptions
-- Copiez-collez ce SQL dans l'éditeur SQL Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public."Inscriptions" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    chat_id TEXT NOT NULL,
    prenom TEXT,
    nom TEXT,
    email TEXT,
    age INT,
    sexe TEXT,        -- Masculin / Féminin
    nationalite TEXT,
    telephone TEXT,   -- Numéro fonctionnel (peut différer du chat_id WhatsApp)
    
    -- Parcours
    niveau_etude TEXT,        -- Primaire / Collège / Lycée / Université / Professionnel
    interet TEXT,             -- Ce qui l'intéresse chez BloLab
    programme_choisi TEXT,    -- ClassTech / Ecole229 / KMC / Incubateur / FabLab
    motivation TEXT,          -- Pourquoi veut-il s'inscrire ?
    comment_connu TEXT,       -- Comment a-t-il entendu parler de BloLab ?
    
    -- Financeur
    financeur_nom TEXT,        -- Qui finance la formation
    financeur_email TEXT,
    financeur_telephone TEXT,
    
    -- Gestion
    statut TEXT DEFAULT 'en_attente', -- en_attente / confirmee / annulee
    notes_agent TEXT,                 -- Notes de l'IA sur la conversation
    
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Activer RLS
ALTER TABLE public."Inscriptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for Inscriptions"
    ON public."Inscriptions"
    FOR ALL USING (true) WITH CHECK (true);

-- Vérification
SELECT 'Table Inscriptions créée avec succès ✅' AS status;
