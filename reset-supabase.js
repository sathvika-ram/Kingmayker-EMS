const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function resetSupabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('TRUNCATE TABLE audit_logs, voters, users RESTART IDENTITY CASCADE');

        const passwordHash = await bcrypt.hash('Meta_family', 12);
        await client.query(
            `INSERT INTO users (name, email, password_hash, role, assigned_constituency)
             VALUES
                ('Super Admin', 'admin@kingmayker.com', $1, 'super_admin', 'All'),
                ('Party Leader', 'leader@kingmayker.com', $1, 'party_leader', 'All')`,
            [passwordHash]
        );

        await client.query('COMMIT');
        console.log('Supabase application data reset successfully.');
        console.log('Created admin@kingmayker.com and leader@kingmayker.com.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Supabase reset failed:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

resetSupabase();
