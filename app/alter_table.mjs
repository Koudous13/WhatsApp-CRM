import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envLines = envContent.split('\n');
envLines.forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
        process.env[key] = val;
    }
});

const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Altering programmes table to add 'slug' and 'status'...");
    
    // Add slug and status columns
    const sql = `
        ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
        ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    `;
    
    const { data, error } = await client.rpc('admin_execute_sql', { sql_query: sql });
    
    if (error) {
        console.error("Migration failed:", error);
    } else {
        console.log("Migration successful!");
    }
}

run();
