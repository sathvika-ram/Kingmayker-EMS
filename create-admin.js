const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mlc_voter_db',
    password: 'sath', // user's pgAdmin password as seen in index.js
    port: 5432,
});

async function createSuperAdmin() {
    const email = 'admin@example.com';
    const plainPassword = 'password123';
    
    try {
        console.log('Connecting to database...');
        
        // Check if user already exists
        const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (checkUser.rows.length > 0) {
            console.log(`User ${email} already exists. Attempting to update password...`);
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(plainPassword, salt);
            
            await pool.query(
                'UPDATE users SET password_hash = $1 WHERE email = $2',
                [passwordHash, email]
            );
            console.log(`Password updated successfully!`);
        } else {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(plainPassword, salt);

            await pool.query(
                `INSERT INTO users (name, email, password_hash, role, assigned_constituency) 
                 VALUES ($1, $2, $3, 'super_admin', 'All')`,
                ['Super Admin', email, passwordHash]
            );
            console.log('Super Admin user created successfully!');
        }
        
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
