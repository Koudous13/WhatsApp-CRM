# 02 — Base de Données (Supabase / PostgreSQL)
## BloLab Dashboard CRM WhatsApp IA

---

## 1. Setup Initial Supabase

### 1.1 Activer l'extension pgvector

```sql
-- À exécuter dans le SQL Editor de Supabase
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 1.2 Créer les types ENUM

```sql
-- Statut de la conversation
CREATE TYPE conversation_status AS ENUM (
  'ai_active',        -- L'IA répond automatiquement
  'escalated',        -- En attente d'un humain
  'assigned',         -- Prise en charge par un admin
  'resolved',         -- Clôturée
  'muted_temp',       -- IA silencieuse temporairement
  'muted_permanent',  -- IA désactivée définitivement
  'vocal_pending'     -- Vocal non transcrit en attente
);

-- Type de message
CREATE TYPE message_type AS ENUM (
  'text', 'audio', 'image', 'video',
  'document', 'sticker', 'contact', 'location'
);

-- Direction du message
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');

-- Rôle administrateur
CREATE TYPE admin_role AS ENUM ('super_admin', 'admin', 'agent', 'readonly');

-- Statut prospect (pipeline de closing)
CREATE TYPE lead_status AS ENUM (
  'Nouveau', 'Qualifie', 'Proposition faite',
  'Interesse', 'Inscription', 'Froid'
);

-- Statut du job de scraping
CREATE TYPE scrape_status AS ENUM ('pending', 'running', 'success', 'failed');

-- Statut de campagne broadcast
CREATE TYPE broadcast_status AS ENUM (
  'draft', 'scheduled', 'running', 'completed', 'failed'
);
```

---

## 2. Tables Principales

### 2.1 Table `contacts` (CDP — Profil Prospects)

```sql
CREATE TABLE contacts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whatsapp_number     TEXT UNIQUE NOT NULL,     -- Format: +22990XXXXXX
  prenom              TEXT,
  nom                 TEXT,
  first_contact_at    TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at     TIMESTAMPTZ DEFAULT NOW(),
  opt_in              BOOLEAN DEFAULT TRUE,
  
  -- CDP / Profilage IA silencieux
  tags                TEXT[] DEFAULT '{}',
  langue_vernaculaire BOOLEAN DEFAULT FALSE,
  centre_interet      TEXT,
  profil_type         TEXT,                     -- 'Parent', 'Enfant', 'Etudiant', 'Pro', 'Entrepreneur'
  niveau_actuel       TEXT,                     -- 'Débutant', 'Quelques bases', 'Intermédiaire'
  age                 TEXT,
  disponibilite       TEXT,
  objectif            TEXT,
  budget_mentionne    TEXT,
  objections          TEXT,
  programme_recommande TEXT,
  score_lead          INTEGER DEFAULT 0 CHECK (score_lead BETWEEN 0 AND 10),
  nombre_interactions INTEGER DEFAULT 0,
  
  -- Statut & Assignation
  statut_conversation conversation_status DEFAULT 'ai_active',
  assigned_to         UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  muted_until         TIMESTAMPTZ,              -- NULL = pas de mute temporaire
  
  statut_lead         lead_status DEFAULT 'Nouveau',
  notes               TEXT,
  
  -- Blacklist
  is_blacklisted      BOOLEAN DEFAULT FALSE,
  blacklisted_at      TIMESTAMPTZ,
  blacklisted_reason  TEXT,
  
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches fréquentes
CREATE INDEX idx_contacts_whatsapp ON contacts(whatsapp_number);
CREATE INDEX idx_contacts_opt_in ON contacts(opt_in);
CREATE INDEX idx_contacts_status ON contacts(statut_conversation);
CREATE INDEX idx_contacts_score ON contacts(score_lead DESC);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);
```

### 2.2 Table `conversations`

```sql
CREATE TABLE conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  status          conversation_status DEFAULT 'ai_active',
  assigned_to     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,
  unread_count    INTEGER DEFAULT 0,
  
  -- Métadonnées
  is_group        BOOLEAN DEFAULT FALSE,
  group_id        TEXT,                         -- ID du groupe WhatsApp si applicable
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_last_msg ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_assigned ON conversations(assigned_to);
```

### 2.3 Table `messages`

```sql
CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  wasender_message_id TEXT UNIQUE,              -- ID message WaSenderAPI pour éviter doublons
  direction           message_direction NOT NULL,
  message_type        message_type DEFAULT 'text',
  
  -- Contenu
  body                TEXT,                     -- Texte du message
  media_url           TEXT,                     -- URL Supabase Storage après upload
  media_filename      TEXT,
  media_mimetype      TEXT,
  
  -- Vocal (STT)
  transcript          TEXT,                     -- Transcription du vocal
  transcript_confidence FLOAT,                  -- Score de confiance (0.0 à 1.0)
  transcript_language TEXT,                     -- Langue détectée (fr, fon, yo, etc.)
  transcript_status   TEXT DEFAULT 'none',      -- 'none' | 'high' | 'medium' | 'low' | 'failed'
  
  -- Statut livraison (mis à jour via webhooks WaSenderAPI)
  delivery_status     TEXT DEFAULT 'sent',      -- 'sent' | 'delivered' | 'read' | 'failed'
  
  -- IA
  is_ai_response      BOOLEAN DEFAULT FALSE,
  ai_log_id           UUID,                     -- Référence vers ai_logs
  
  -- Admin
  sent_by_admin_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  
  timestamp           TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_contact ON messages(contact_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_messages_wasender_id ON messages(wasender_message_id);
CREATE INDEX idx_messages_type ON messages(message_type);
```

### 2.4 Table `knowledge_base` (pgvector — RAG)

```sql
CREATE TABLE knowledge_base (
  id          BIGSERIAL PRIMARY KEY,
  content     TEXT NOT NULL,                    -- Texte du chunk
  embedding   VECTOR(768),                      -- gemini-embedding-001 = 768 dimensions
  
  -- Métadonnées pour le contexte et le versioning
  source_url  TEXT,                             -- URL de la page scrapée
  section     TEXT,                             -- Ex: 'formations', 'fablab', 'incubateur'
  chunk_index INTEGER,                          -- Position dans le document source
  scrape_version INTEGER DEFAULT 1,             -- Version du scraping
  
  is_manual   BOOLEAN DEFAULT FALSE,            -- TRUE si ajouté manuellement (CRUD)
  is_active   BOOLEAN DEFAULT TRUE,             -- FALSE = rollback / désactivé
  
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index IVFFlat pour la recherche vectorielle rapide
-- lists=100 est adapté pour < 1 million de vecteurs
CREATE INDEX idx_knowledge_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_knowledge_section ON knowledge_base(section);
CREATE INDEX idx_knowledge_active ON knowledge_base(is_active);
CREATE INDEX idx_knowledge_version ON knowledge_base(scrape_version);
```

### 2.5 Table `ai_logs` (Traçabilité complète de chaque réponse IA)

```sql
CREATE TABLE ai_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id     UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  
  -- Entrée
  user_message        TEXT NOT NULL,
  message_type        message_type DEFAULT 'text',
  
  -- RAG
  query_embedding     VECTOR(768),
  chunks_retrieved    JSONB,                    -- [{id, content, score, section}]
  similarity_threshold FLOAT DEFAULT 0.75,
  
  -- LLM
  system_prompt       TEXT,
  full_prompt         TEXT,
  llm_response        TEXT,
  llm_model           TEXT,                     -- Ex: 'gemini-2.0-flash'
  
  -- Performance
  processing_time_ms  INTEGER,
  was_escalated       BOOLEAN DEFAULT FALSE,
  escalation_reason   TEXT,
  
  -- Feedback admin
  rating              INTEGER CHECK (rating BETWEEN 1 AND 5),
  correction          TEXT,                     -- Bonne réponse suggérée par l'admin
  
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_conversation ON ai_logs(conversation_id);
CREATE INDEX idx_ai_logs_created ON ai_logs(created_at DESC);
CREATE INDEX idx_ai_logs_escalated ON ai_logs(was_escalated) WHERE was_escalated = TRUE;
```

### 2.6 Table `admin_users`

```sql
-- Les comptes sont créés via Supabase Auth.
-- Cette table étend le profil avec les rôles métier.
CREATE TABLE admin_users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        admin_role DEFAULT 'agent',
  avatar_url  TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.7 Table `scraping_jobs`

```sql
CREATE TABLE scraping_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_by    UUID REFERENCES admin_users(id),  -- NULL = cron automatique
  
  status          scrape_status DEFAULT 'pending',
  pages_scraped   INTEGER DEFAULT 0,
  chunks_created  INTEGER DEFAULT 0,
  version         INTEGER NOT NULL,
  
  error_message   TEXT,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.8 Tables Broadcast

```sql
CREATE TABLE broadcasts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by      UUID REFERENCES admin_users(id),
  
  name            TEXT NOT NULL,
  body            TEXT NOT NULL,                -- Message avec formatage WhatsApp
  media_url       TEXT,
  
  status          broadcast_status DEFAULT 'draft',
  scheduled_at    TIMESTAMPTZ,                  -- NULL = envoi immédiat
  sent_at         TIMESTAMPTZ,
  
  -- Audience
  audience_filters JSONB,                       -- Ex: {"tags": ["Ecole229"], "opt_in": true}
  total_recipients INTEGER DEFAULT 0,
  
  -- Stats
  sent_count      INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count      INTEGER DEFAULT 0,
  failed_count    INTEGER DEFAULT 0,
  optout_count    INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE broadcast_recipients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  broadcast_id    UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  
  status          TEXT DEFAULT 'pending',       -- 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  wasender_msg_id TEXT,
  sent_at         TIMESTAMPTZ,
  
  UNIQUE(broadcast_id, contact_id)
);

CREATE INDEX idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);
CREATE INDEX idx_broadcast_recipients_status ON broadcast_recipients(status);
```

### 2.9 Table `conversation_assignments_log`

```sql
-- Historique complet des changements de statut/assignation
CREATE TABLE conversation_assignments_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  changed_by      UUID REFERENCES admin_users(id),
  
  old_status      conversation_status,
  new_status      conversation_status,
  old_assigned_to UUID,
  new_assigned_to UUID,
  
  note            TEXT,                         -- Ex: "Prise en main par Marie"
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Triggers Automatiques

```sql
-- Trigger: met à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: quand un message arrive, mettre à jour la conversation
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET
    last_message_at = NEW.timestamp,
    last_message_preview = LEFT(COALESCE(NEW.body, '[Média]'), 80),
    unread_count = CASE
      WHEN NEW.direction = 'inbound' THEN unread_count + 1
      ELSE 0
    END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_update_conversation
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
```

---

## 4. Row Level Security (RLS)

```sql
-- Activer RLS sur toutes les tables sensibles
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Politique : seuls les admins authentifiés peuvent tout lire/écrire
-- (Le service_role_key côté serveur bypass RLS automatiquement)

CREATE POLICY "Admin full access on contacts"
  ON contacts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid() AND is_active = TRUE
    )
  );

-- Même pattern pour toutes les autres tables (écrire pour chacune)
-- Les routes API utilisent le service_role_key → bypass RLS
-- Le client browser Supabase utilise l'anon key + JWT → soumis à RLS
```

---

## 5. Fonction de Recherche Vectorielle (pgvector)

```sql
-- Fonction utilisée par le pipeline RAG pour trouver les chunks pertinents
CREATE OR REPLACE FUNCTION search_knowledge(
  query_embedding VECTOR(768),
  similarity_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  source_url TEXT,
  section TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    kb.id,
    kb.content,
    kb.source_url,
    kb.section,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE
    kb.is_active = TRUE
    AND 1 - (kb.embedding <=> query_embedding) > similarity_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

## 6. Supabase Realtime — Configuration

```sql
-- Activer Realtime sur les tables qui alimentent le dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
```

```typescript
// lib/supabase/realtime.ts — Exemple d'écoute côté client
import { createClient } from '@/lib/supabase/client'

export function subscribeToInbox(
  onNewMessage: (msg: Message) => void
) {
  const supabase = createClient()
  
  return supabase
    .channel('inbox-realtime')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'direction=eq.inbound'
      },
      (payload) => onNewMessage(payload.new as Message)
    )
    .subscribe()
}
```

---

## 7. Diagramme des Relations

```
admin_users
    │
    ├──(assigns)──► conversations ◄──────── contacts
    │                    │                     │
    │               messages              broadcast_recipients
    │                    │                     │
    │               ai_logs              broadcasts ◄──(created_by)── admin_users
    │
    └──(triggers)──► scraping_jobs
    
knowledge_base (pgvector)  ←── scrapé par scraping_jobs
conversation_assignments_log ←── log de chaque changement de statut
```

---

*Section 02 complète — Prochaine étape : `03_WORKFLOW_WEBHOOK_RECEPTION.md`*
