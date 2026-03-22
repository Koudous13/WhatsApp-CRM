-- ==========================================
-- SCRIPT DE MISE À JOUR BASE DE DONNÉES V2
-- À exécuter dans l'éditeur SQL de Supabase
-- ==========================================

-- 1. Table des Programmes Dynamiques
CREATE TABLE IF NOT EXISTS programmes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT UNIQUE NOT NULL,
    description TEXT,
    cible TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertion des programmes par défaut si la table est vide
INSERT INTO programmes (nom, description, cible) 
VALUES 
    ('ClassTech', 'Initiation à la robotique et impression 3D.', 'Jeunes et Ados'),
    ('Ecole229', 'Formation intensive aux métiers du numérique.', 'Jeunes déscolarisés et diplômés sans emploi'),
    ('KMC', 'Kids Makers Club - Robotique et codage pour enfants.', 'Enfants 8-15 ans'),
    ('Incubateur', 'Accompagnement de startups technologiques.', 'Porteurs de projets innovants'),
    ('Empow''her', 'Programme d''autonomisation des femmes par le numérique.', 'Femmes 18-35 ans')
ON CONFLICT (nom) DO NOTHING;

-- 2. Table des Ajustements Manuels (Manual Overrides)
CREATE TABLE IF NOT EXISTS stats_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_key TEXT UNIQUE NOT NULL, -- Ex: 'total_contacts', 'inscrits_classtech'
    manual_value INTEGER,
    offset_value INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Vue simplifiée pour l'analytique des programmes
CREATE OR REPLACE VIEW stats_programmes_view AS
SELECT 
    p.id AS programme_id,
    p.nom AS programme_nom,
    COUNT(i.id) AS total_inscrits
FROM 
    programmes p
LEFT JOIN 
    "Inscriptions" i ON LOWER(i.programme_choisi) LIKE '%' || LOWER(p.nom) || '%'
GROUP BY 
    p.id, p.nom;
