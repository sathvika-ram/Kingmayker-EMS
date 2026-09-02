const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const accounts = [
    { name: 'Super Admin', email: 'admin@kingmayker.com', password: 'admin-password', role: 'super_admin', assignedRegion: 'All', assignedConstituency: 'All', assignedMandal: null },
    { name: 'Party Leader', email: 'leader@kingmayker.com', password: 'leader', role: 'party_leader', assignedRegion: 'All', assignedConstituency: 'All', assignedMandal: null },
    { name: 'Agent', email: 'agent@kingmayker.com', password: 'agent', role: 'constituency_coordinator', assignedRegion: 'All', assignedConstituency: 'All', assignedMandal: null },
];

async function syncCredentials() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const account of accounts) {
            const passwordHash = await bcrypt.hash(account.password, 12);
            await client.query(
                `INSERT INTO users (name, email, password_hash, role, assigned_region, assigned_constituency, assigned_mandal)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (email) DO UPDATE SET
                    name = EXCLUDED.name,
                    password_hash = EXCLUDED.password_hash,
                    role = EXCLUDED.role,
                    assigned_region = EXCLUDED.assigned_region,
                    assigned_constituency = EXCLUDED.assigned_constituency,
                    assigned_mandal = EXCLUDED.assigned_mandal`,
                [account.name, account.email, passwordHash, account.role, account.assignedRegion, account.assignedConstituency, account.assignedMandal]
            );
        }

        await client.query('COMMIT');
        console.log('Credentials synchronized without deleting existing users, voters, or audit logs.');
        console.log('admin@kingmayker.com -> super_admin');
        console.log('leader@kingmayker.com -> party_leader');
        console.log('agent@kingmayker.com -> all constituencies and regions');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Credential synchronization failed:', error.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

syncCredentials();
