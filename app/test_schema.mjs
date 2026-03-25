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

async function check() {
    console.log("Checking columns of 'programmes' table...");
    const { data, error } = await client.rpc('admin_execute_sql', { 
        sql_query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'programmes';" 
    });
    
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("Columns:", data);
    }
}

check();
