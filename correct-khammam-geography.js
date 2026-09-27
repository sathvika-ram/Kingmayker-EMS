const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const requestedMandals = [
    { acNo: 117, constituency: 'Kothagudem', names: ['Chatakonda', 'Ramavaram', 'Srinagar', 'Prashanthi Nagar', 'Chandrugonda'] },
    { acNo: 118, constituency: 'Aswaraopeta (ST)', names: ['Annapareddypalli'] },
    { acNo: 110, constituency: 'Pinapaka (ST)', names: ['Karakagudem', 'Allapally'] },
];

async function correctGeography() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const wyraCorrection = await client.query(
            `UPDATE master_geography
             SET "Mandal" = 'Enkoor'
             WHERE "Old District" = 'Khammam'
               AND "AC No" = 115
               AND "Assembly Constituency" = 'Wyra (ST)'
               AND "Mandal" = 'Enkuru'`
        );

        const madhiraSplit = await client.query(
            `UPDATE master_geography
             SET "Mandal" = CASE WHEN "Village" = 'Madhira (Ct)' THEN 'Madhira Town' ELSE 'Madhira Rural' END
             WHERE "Old District" = 'Khammam'
               AND "AC No" = 114
               AND "Assembly Constituency" = 'Madhira (SC)'
               AND "Mandal" = 'Madhira'`
        );
                if (!madhiraSplit.rowCount) {
                        const existingSplit = await client.query(
                                `SELECT 1 FROM master_geography
                                 WHERE "AC No" = 114
                                     AND "Assembly Constituency" = 'Madhira (SC)'
                                     AND "Mandal" IN ('Madhira Rural', 'Madhira Town')
                                 LIMIT 1`
                        );
                        if (!existingSplit.rowCount) throw new Error('No Madhira rows matched the expected source data.');
                }

        const bhadrachalamSplit = await client.query(
            `UPDATE master_geography
             SET "Mandal" = CASE WHEN "Village" = 'Bhadrachalam (Ct)' THEN 'Bhadrachalam Town' ELSE 'Bhadrachalam Rural' END
             WHERE "Old District" = 'Khammam'
               AND "AC No" = 119
               AND "Assembly Constituency" = 'Bhadrachalam (ST)'
               AND "Mandal" = 'Bhadrachalam'`
        );
                if (!bhadrachalamSplit.rowCount) {
                        const existingSplit = await client.query(
                                `SELECT 1 FROM master_geography
                                 WHERE "AC No" = 119
                                     AND "Assembly Constituency" = 'Bhadrachalam (ST)'
                                     AND "Mandal" IN ('Bhadrachalam Rural', 'Bhadrachalam Town')
                                 LIMIT 1`
                        );
                        if (!existingSplit.rowCount) throw new Error('No Bhadrachalam rows matched the expected source data.');
                }

        let insertedOptions = 0;
        for (const group of requestedMandals) {
            for (const mandal of group.names) {
                const inserted = await client.query(
                    `INSERT INTO master_geography (
                        "Old District", "Region", "AC No", "Assembly Constituency", "Mandal", "Source", "Mapping Status"
                     )
                     SELECT source."Old District", source."Region", source."AC No", source."Assembly Constituency", $3,
                            'manual_mandal_option', 'dropdown-only'
                     FROM master_geography source
                     WHERE source."Old District" = 'Khammam'
                       AND source."AC No" = $1
                       AND source."Assembly Constituency" = $2
                       AND NOT EXISTS (
                           SELECT 1 FROM master_geography existing
                           WHERE existing."Old District" = 'Khammam'
                             AND existing."AC No" = $1
                             AND existing."Assembly Constituency" = $2
                             AND existing."Mandal" = $3
                       )
                     LIMIT 1`,
                    [group.acNo, group.constituency, mandal]
                );
                insertedOptions += inserted.rowCount;
            }
        }

        await client.query('COMMIT');
        console.log(JSON.stringify({
            wyraEnkuruRowsNormalized: wyraCorrection.rowCount,
            madhiraRowsSplit: madhiraSplit.rowCount,
            bhadrachalamRowsSplit: bhadrachalamSplit.rowCount,
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
    console.error('Khammam geography correction failed:', error.message);
    process.exitCode = 1;
});