-- Table pour les catégories personnalisées de l'Inbox
CREATE TABLE IF NOT EXISTS public.Inbox_Categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#64748b',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertion des catégories de base
INSERT INTO public.Inbox_Categories (name, color) 
VALUES ('Action Requise', '#f59e0b'), ('IA en cours', '#10b981'), ('Clos', '#64748b')
ON CONFLICT (name) DO NOTHING;

-- Ajout d'une colonne category_id dans conversations si elle n'existe pas
DO  
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='category_id') THEN
        ALTER TABLE public.conversations ADD COLUMN category_id UUID REFERENCES public.Inbox_Categories(id);
    END IF;
END ;
