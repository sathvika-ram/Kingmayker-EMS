const { Pool } = require('pg');
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'mlc_voter_db',
    password: 'sath',
    port: 5432,
});

pool.query("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = (SELECT udt_name FROM information_schema.columns WHERE table_name = 'voters' AND column_name = 'enrollment_status')")
    .then(res => { console.table(res.rows); pool.end(); })
    .catch(console.error);
