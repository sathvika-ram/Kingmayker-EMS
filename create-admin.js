const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

async function createSuperAdmin() {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const plainPassword = process.env.ADMIN_PASSWORD;
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ADMIN_SEED !== 'true') {
        throw new Error('Refusing to seed an admin in production without ALLOW_ADMIN_SEED=true.');
    }
    if (!email || !plainPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be configured.');
    
    try {
        console.log('Connecting to database...');
        
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(plainPassword, salt);
        await pool.query(
            `INSERT INTO users (name, email, password_hash, role, assigned_region, assigned_constituency)
             VALUES ($1, $2, $3, 'super_admin', 'All', 'All')
             ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                assigned_region = EXCLUDED.assigned_region,
                assigned_constituency = EXCLUDED.assigned_constituency`,
            ['Super Admin', email, passwordHash]
        );
        console.log(`Admin account ${email} synchronized without deleting data.`);
        
        console.log('-------------------------------------------');
        console.log('You can now log in with:');
        console.log(`Email: ${email}`);
        console.log(`Password: ${plainPassword}`);
        console.log('-------------------------------------------');

    } catch (err) {
        console.error('Error creating super admin:', err);
    } finally {
        await pool.end();
    }
}

createSuperAdmin();
