const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const region = 'Warangal';
const renames = [
    { acNo: 107, constituency: 'Wardhannapet (SC)', from: 'Navolu', to: 'Inavolu' },
    { acNo: 102, constituency: 'Mahabubabad (ST)', from: 'Ingurthy', to: 'Inugurthy' },
    { acNo: 98, constituency: 'Jangaon', from: 'Cheryala', to: 'Cheryal' },
    { acNo: 108, constituency: 'Bhupalpalle', from: 'Ghanpur (Mulug)', to: 'Ghanpur' },
    { acNo: 108, constituency: 'Bhupalpalle', from: 'Shayampet', to: 'Shyampet' },
    { acNo: 108, constituency: 'Bhupalpalle', from: 'Kothapallygori', to: 'Gori Kothapally' },
    { acNo: 106, constituency: 'Warangal East', from: 'Warangal (Municipal Corporation ward area)', to: 'GWMC' },
    { acNo: 105, constituency: 'Warangal West', from: 'Warangal (Municipal Corporation ward area)', to: 'GWMC' },
];

const requestedMandals = [
    { acNo: 107, constituency: 'Wardhannapet (SC)', names: ['Geesugonda'] },
    { acNo: 105, constituency: 'Warangal West', names: ['Hanamkonda', 'Kazipet'] },
    { acNo: 109, constituency: 'Mulug (ST)', names: ['Kannaigudem'] },
    { acNo: 102, constituency: 'Mahabubabad (ST)', names: ['Danthalapalle'] },
];

async function renameMandal(client, { acNo, constituency, from, to }) {
    const updated = await client.query(
        `UPDATE master_geography
         SET "Mandal" = $4
         WHERE "Old District" = $1
           AND "AC No" = $2
           AND "Assembly Constituency" = $3
           AND "Mandal" = $5`,
        [region, acNo, constituency, to, from]
    );
    if (updated.rowCount) return updated.rowCount;

    const alreadyRenamed = await client.query(
        `SELECT 1 FROM master_geography
         WHERE "Old District" = $1
           AND "AC No" = $2
           AND "Assembly Constituency" = $3
           AND "Mandal" = $4
         LIMIT 1`,
        [region, acNo, constituency, to]
    );
    if (!alreadyRenamed.rowCount) throw new Error(`Could not find ${from} or ${to} for ${constituency}.`);
    return 0;
}

async function addMandalOption(client, { acNo, constituency, mandal }) {
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

        const renamedRows = {};
        for (const rename of renames) {
            renamedRows[`${rename.constituency}: ${rename.from} -> ${rename.to}`] =
                await renameMandal(client, rename);
        }

        const hiddenOldWestOptions = await client.query(
            `UPDATE master_geography
             SET "Source" = 'hidden_mandal_option', "Mapping Status" = 'hidden-dropdown'
             WHERE "Old District" = $1
               AND "AC No" = 105
               AND "Assembly Constituency" = 'Warangal West'
               AND "Mandal" = 'Warangal'
               AND COALESCE("Source", '') <> 'hidden_mandal_option'`,
            [region]
        );

        let insertedOptions = 0;
        for (const group of requestedMandals) {
            for (const mandal of group.names) {
                insertedOptions += await addMandalOption(client, {
                    acNo: group.acNo,
                    constituency: group.constituency,
                    mandal,
                });
            }
        }

        await client.query('COMMIT');
        console.log(JSON.stringify({
            renamedRows,
            warangalWestRowsHiddenFromDropdown: hiddenOldWestOptions.rowCount,
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
    console.error('Warangal geography correction failed:', error.message);
    process.exitCode = 1;
});