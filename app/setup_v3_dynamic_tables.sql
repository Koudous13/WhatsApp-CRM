-- ==========================================
-- SCRIPT : ACTIVER LA CRÉATION DYNAMIQUE DE TABLES (DDL)
-- À exécuter dans l'éditeur SQL de Supabase
-- ==========================================

-- 1. Activer l'extension pour pouvoir générer des noms de tables sécurisés si besoin
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Création de la fonction RPC permettant d'exécuter du DDL depuis le back-end Next.js
-- AVERTISSEMENT DE SÉCURITÉ : Cette fonction est "SECURITY DEFINER" et s'exécute avec les droits d'admin.
-- Elle ne doit être appelée QUE par le serveur Next.js avec la clé SERVICE_ROLE.
CREATE OR REPLACE FUNCTION admin_execute_sql(sql_query text)
RETURNS void AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Création de la table de métadonnées pour mémoriser quelles tables/colonnes appartiennent à quel programme
CREATE TABLE IF NOT EXISTS programme_schema (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    programme_id UUID REFERENCES programmes(id) ON DELETE CASCADE,
    table_name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Création de la table pour stocker les définitions des colonnes dynamiques
CREATE TABLE IF NOT EXISTS programme_colonnes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    programme_id UUID REFERENCES programmes(id) ON DELETE CASCADE,
    column_name TEXT NOT NULL,
    column_type TEXT NOT NULL, -- 'text', 'integer', 'boolean', 'date'
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(programme_id, column_name)
);
