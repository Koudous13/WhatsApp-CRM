import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envLocal = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const lines = envLocal.split('\n');
let SUPABASE_SERVICE_ROLE_KEY = '';
for (const line of lines) {
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
        SUPABASE_SERVICE_ROLE_KEY = line.split('=')[1].trim();
    }
}

const SUPABASE_URL = 'https://oejsmgyzirwypwvsqymn.supabase.co';

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Veuillez fournir SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sql = `
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

  CREATE TABLE IF NOT EXISTS programmes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS programme_champs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      programme_id UUID REFERENCES programmes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      options JSONB,
      is_required BOOLEAN DEFAULT true,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
  );
`;

async function main() {
    console.log("Exécution de l'initialisation...");
    const { data, error } = await supabase.rpc('admin_execute_sql', { sql_query: sql });
    
    if (error) {
        console.error("Erreur SQL:", error);
    } else {
        console.log("Succès ! Les tables programmes et programme_champs sont créées.");
    }
}

main();
