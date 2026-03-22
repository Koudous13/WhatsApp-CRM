-- 1. Création de la table Inbox_Categories
CREATE TABLE IF NOT EXISTS public."Inbox_Categories" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ajout de la colonne category_id dans conversations (si elle n'existe pas)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='category_id') THEN
        ALTER TABLE public.conversations ADD COLUMN category_id UUID REFERENCES public."Inbox_Categories"(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Activer RLS pour Inbox_Categories (facultatif selon votre config, mais recommandé)
ALTER TABLE public."Inbox_Categories" ENABLE ROW LEVEL SECURITY;

-- Autoriser tout le monde (ou à affiner selon votre authentification)
CREATE POLICY "Allow all for Inbox_Categories" ON public."Inbox_Categories" FOR ALL USING (true) WITH CHECK (true);

-- 4. Insérer des catégories par défaut
INSERT INTO public."Inbox_Categories" (name, color) 
VALUES 
('Action Requise', '#ef4444'),
('IA en cours', '#10b981'),
('Clos', '#64748b'),
('VIP', '#f59e0b')
ON CONFLICT (name) DO NOTHING;
