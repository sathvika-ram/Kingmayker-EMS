const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const requestedMandals = [
    { acNo: 92, constituency: 'Nalgonda', names: ['Nalgonda Town'] },
    { acNo: 93, constituency: 'Munugode', names: ['Ghattuppal'] },
    { acNo: 108, constituency: 'Bhupalpalle', names: ['Tekumatla'] },
    { acNo: 101, constituency: 'Dornakal (ST)', names: ['Seerole'] },
    { acNo: 98, constituency: 'Jangaon', names: ['Dhulmetta', 'Tharigoppula'] },
    { acNo: 102, constituency: 'Mahabubabad (ST)', names: ['Ingurthy'] },
    { acNo: 107, constituency: 'Wardhannapet (SC)', names: ['Navolu'] },
];

async function renameMandal(client, { region, acNo, constituency, oldName, newName }) {
    const updated = await client.query(
        `UPDATE master_geography
         SET "Mandal" = $5
         WHERE "Old District" = $1
           AND "AC No" = $2
           AND "Assembly Constituency" = $3
           AND "Mandal" = $4`,
        [region, acNo, constituency, oldName, newName]
    );
    if (updated.rowCount) return updated.rowCount;

    const alreadyCorrected = await client.query(
        `SELECT 1 FROM master_geography
         WHERE "Old District" = $1
           AND "AC No" = $2
           AND "Assembly Constituency" = $3
           AND "Mandal" = $4
         LIMIT 1`,
        [region, acNo, constituency, newName]
    );
    if (!alreadyCorrected.rowCount) throw new Error(`No ${oldName} rows found for ${constituency}.`);
    return 0;
}

async function insertMandalOption(client, { region, acNo, constituency, mandal }) {
    const result = await client.query(
        `INSERT INTO master_geography (
            "Old District", "Region", "AC No", "Assembly Constituency", "Mandal", "Source", "Mapping Status"
         )
         SELECT source."Old District", source."Region", source."AC No", source."Assembly Constituency", $4,
                'manual_mandal_option', 'dropdown-only'
         FROM master_geography source
         WHERE source."Old District" = $1
           AND source."AC No" = $2
           AND source."Assembly Constituency" = $3
           AND NOT EXISTS (
               SELECT 1 FROM master_geography existing
               WHERE existing."Old District" = $1
                 AND existing."AC No" = $2
                 AND existing."Assembly Constituency" = $3
                 AND existing."Mandal" = $4
           )
         LIMIT 1`,
        [region, acNo, constituency, mandal]
    );
    return result.rowCount;
}

async function correctGeography() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const nalgondaSpellingRows = await renameMandal(client, {
            region: 'Nalgonda', acNo: 92, constituency: 'Nalgonda',
            oldName: 'Thipparthy', newName: 'Thipparthi',
        });
        const jangaonSpellingRows = await renameMandal(client, {
            region: 'Warangal', acNo: 98, constituency: 'Jangaon',
            oldName: 'Cherial', newName: 'Cheryala',
        });

        let insertedOptions = 0;
        for (const group of requestedMandals) {
            for (const mandal of group.names) {
                insertedOptions += await insertMandalOption(client, {
                    region: group.acNo < 97 ? 'Nalgonda' : 'Warangal',
                    acNo: group.acNo,
                    constituency: group.constituency,
                    mandal,
                });
            }
        }

        await client.query('COMMIT');
        console.log(JSON.stringify({
            nalgondaThipparthiRowsRenamed: nalgondaSpellingRows,
            jangaonCheryalaRowsRenamed: jangaonSpellingRows,
            mandalOptionsInserted: insertedOptions,
        }, null, 2));
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

correctGeography().catch(error => {
    console.error('Nalgonda/Warangal geography correction failed:', error.message);
    process.exitCode = 1;
});