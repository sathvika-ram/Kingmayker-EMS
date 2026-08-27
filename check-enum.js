const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

pool.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = (SELECT udt_name FROM information_schema.columns WHERE table_name = 'voters' AND column_name = 'enrollment_status')")
    .then(res => { console.table(res.rows); pool.end(); })
    .catch(console.error);
