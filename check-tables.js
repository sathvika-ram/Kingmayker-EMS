const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'mlc_voter_db', password: 'sath', port: 5432 });
pool.query("SELECT DISTINCT old_district FROM master_geography LIMIT 5")
    .then(res => { console.table(res.rows); pool.end(); })
    .catch(console.error);
