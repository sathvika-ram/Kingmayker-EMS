const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
pool.query('SELECT DISTINCT "Old District" FROM master_geography LIMIT 5')
    .then(res => { console.table(res.rows); pool.end(); })
    .catch(console.error);
