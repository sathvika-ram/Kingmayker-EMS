const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mlc_voter_db',
    password: 'sath',
    port: 5432,
});

async function fixPassword() {
    try {
        const email = 'admin@kingmayker.com';
        const plainPassword = 'Meta_family';
        
        console.log(`Hashing password for ${email}...`);
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(plainPassword, salt);
        
        await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
        console.log('Successfully updated the password hash to allow login!');
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

fixPassword();
