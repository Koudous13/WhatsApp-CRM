const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
});

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];

const sql = `
    CREATE TABLE IF NOT EXISTS broadcast_sequences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        programme_nom TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES broadcast_sequences(id) ON DELETE CASCADE;
    ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS sequence_step_index INT;
`;

async function run() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_execute_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({ query: sql })
    });
    const data = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", data);
}

run();
