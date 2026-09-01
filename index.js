const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL Connection Pool Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
});
pool.on('error', error => console.error('PostgreSQL pool error:', error.message));

const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_SECRET_JWT_KEY';

async function ensureVoterColumns() {
    await pool.query(`
        ALTER TABLE voters
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS complete_address TEXT,
        ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
        ADD COLUMN IF NOT EXISTS degree_certificate_url TEXT,
        ADD COLUMN IF NOT EXISTS degree_certificate_urls TEXT[]
    `);
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_region VARCHAR(120)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_mandal VARCHAR(120)');
    await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    await pool.query('ALTER TABLE voters ALTER COLUMN email DROP NOT NULL');
}

function normalizeEmailPart(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}

function buildCoordinatorEmail(name, constituency) {
    const firstName = normalizeEmailPart(String(name || '').trim().split(/\s+/)[0]);
    const area = normalizeEmailPart(constituency);
    return `${firstName}.${area}@kingmayker.com`;
}

    function writeAudit(userId, action, details = {}) {
        return pool.query(
            'INSERT INTO audit_logs (user_id, action, details, timestamp) VALUES ($1, $2, $3, NOW())',
            [userId || null, action, details]
        ).catch(error => console.error('Audit log write failed:', error.message));
    }

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

const requireRoles = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
};

app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ status: 'Connected to PostgreSQL successfully', time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });
        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });
        let assignedRegion = user.assigned_region;
        if (!assignedRegion && user.assigned_constituency) {
            const geography = await pool.query('SELECT "Old District" FROM master_geography WHERE "Assembly Constituency" = $1 LIMIT 1', [user.assigned_constituency]);
            assignedRegion = geography.rows[0]?.['Old District'] || null;
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, region: assignedRegion, constituency: user.assigned_constituency, mandal: user.assigned_mandal },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

            res.json({ message: 'Login successful', token, role: user.role, name: user.name, assigned_region: assignedRegion, assigned_constituency: user.assigned_constituency, assigned_mandal: user.assigned_mandal });
            writeAudit(user.id, 'user_login', { role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.post('/api/admin/create-coordinator', authenticateToken, requireRoles('super_admin'), async (req, res) => {
    const { name, mobile_number, temp_password, assigned_region, assigned_constituency, assigned_mandal } = req.body;
    try {
        const normalizedName = String(name || '').trim();
        if (!normalizedName || !/^\d{10}$/.test(String(mobile_number || '')) || !temp_password || !assigned_region || !assigned_constituency || !assigned_mandal) {
            return res.status(400).json({ error: 'Name, 10-digit mobile, password, region, constituency, and mandal are required.' });
        }
        const geography = await pool.query(
            'SELECT 1 FROM master_geography WHERE "Old District" = $1 AND "Assembly Constituency" = $2 AND "Mandal" = $3 LIMIT 1',
            [assigned_region, assigned_constituency, assigned_mandal]
        );
        if (!geography.rowCount) return res.status(400).json({ error: 'The selected region, constituency, and mandal do not match.' });
        const coordinatorEmail = buildCoordinatorEmail(normalizedName, assigned_constituency);
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(temp_password, salt);
            const newCoordinator = await pool.query(
                `INSERT INTO users (name, email, mobile_number, password_hash, role, assigned_region, assigned_constituency, assigned_mandal) 
                 VALUES ($1, $2, $3, $4, 'constituency_coordinator', $5, $6, $7) RETURNING id, name, email, mobile_number, assigned_region, assigned_constituency, assigned_mandal`,
                [normalizedName, coordinatorEmail, mobile_number, passwordHash, assigned_region, assigned_constituency, assigned_mandal]
        );
            writeAudit(req.user?.id, 'coordinator_created', { coordinator_id: newCoordinator.rows[0].id, assigned_constituency, assigned_mandal });
        res.status(201).json({ message: `Coordinator created. Login email: ${coordinatorEmail}`, coordinator: newCoordinator.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'A coordinator already uses this generated login email.' });
        res.status(500).json({ error: 'Failed to create coordinator' });
    }
});

app.post('/api/voters/enroll', authenticateToken, requireRoles('constituency_coordinator', 'super_admin'), async (req, res) => {
    // Handling both sets of fields from the modified form
    const {
        voter_id, voter_name, father_name, date_of_birth, mobile_number, email, gender, nationality, application_type,
        degree_qualification, graduation_year, form18_number, acknowledgement_number, reference_number, region,
        constituency, mandal, house_number, street, complete_address, village, district, state, pincode, degree_certificate_url, degree_certificate_urls, notes
    } = req.body;
    try {
        const isAllAccessAgent = req.user.role === 'constituency_coordinator' && (req.user.constituency === 'All' || req.user.region === 'All' || !req.user.constituency || !req.user.region);
        if (req.user.role === 'constituency_coordinator' && !isAllAccessAgent && (constituency !== req.user.constituency || (req.user.region && region !== req.user.region) || (req.user.mandal && mandal !== req.user.mandal))) {
            return res.status(403).json({ error: 'You can enroll voters only in your assigned geography' });
        }
        if (req.user.role === 'super_admin') {
            const coordinator = await pool.query('SELECT id FROM users WHERE id = $1 AND role = \'constituency_coordinator\'', [req.body.coordinator_id]);
            if (!coordinator.rowCount) return res.status(400).json({ error: 'Select a valid coordinator for this enrollment.' });
        }
        if (!voter_id || !voter_name || !date_of_birth || !/^\d{10}$/.test(String(mobile_number || '')) || !gender || !degree_qualification || !graduation_year || !acknowledgement_number || !complete_address || !village || !district || !pincode) {
            return res.status(400).json({ error: 'Please complete all required enrollment fields.' });
        }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return res.status(400).json({ error: 'Enter a valid personal email address.' });
        if (!/^\d{6}$/.test(String(pincode))) return res.status(400).json({ error: 'Check the pincode.' });
        if (Number(graduation_year) > 2023) return res.status(400).json({ error: 'Only graduates who passed out before November 2023 are eligible.' });
        const submittedDocumentUrls = Array.isArray(req.body.degree_certificate_urls)
            ? req.body.degree_certificate_urls.filter(Boolean)
            : (degree_certificate_url ? [degree_certificate_url] : []);
        if (submittedDocumentUrls.length > 2) return res.status(400).json({ error: 'You can upload a maximum of two supporting documents.' });
        const documentUrls = submittedDocumentUrls;
        if (!documentUrls.length) return res.status(400).json({ error: 'Please upload at least one supporting document.' });

        const dateOfBirth = new Date(date_of_birth);
        const ageAtGraduation = Number(graduation_year) - dateOfBirth.getFullYear();
        if (Number.isNaN(dateOfBirth.getTime())) {
            return res.status(400).json({ error: 'Invalid date of birth.' });
        }
        if (ageAtGraduation < 20) {
            return res.status(400).json({ error: 'Invalid age' });
        }
        const voterEmail = String(email || `${String(voter_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@kingmayker.com`).trim();
        const newVoter = await pool.query(
            `INSERT INTO voters (
                coordinator_id, voter_name, father_name, date_of_birth,
                mobile_number, citizenship_status, constituency, mandal,
                village, degree_qualification, graduation_year, degree_certificate_url, degree_certificate_urls, enrollment_status,
                voter_id, gender, email, nationality, application_type,
                form18_number, acknowledgement_number, reference_number, house_number, street,
                complete_address, district, state, pincode, region, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending',
                $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING *`,
            [
                req.body.coordinator_id || req.user.id, voter_name, father_name, date_of_birth,
                mobile_number, true, constituency, mandal,
                village, degree_qualification, graduation_year, documentUrls[0], documentUrls,
                voter_id, gender, voterEmail, nationality, application_type,
                form18_number, acknowledgement_number, reference_number, house_number, street,
                complete_address || [house_number, street].filter(Boolean).join(', '), district, state, pincode, region, notes
            ]
        );
        res.status(201).json({ message: 'Enrolled', voter: newVoter.rows[0] });
            writeAudit(req.user.id, 'voter_enrolled', { voter_id: newVoter.rows[0].id, constituency, mandal });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error while processing voter enrollment' });
    }
});

app.get('/api/admin/voters', authenticateToken, requireRoles('super_admin', 'party_leader'), async (req, res) => {
    const { region, constituency, status, mandal } = req.query;
    try {
        let query = 'SELECT v.*, u.name as coordinator_name FROM voters v LEFT JOIN users u ON v.coordinator_id = u.id WHERE 1=1';
        let params = [];
        let paramIndex = 1;
        if (region) { query += ` AND v.region = $${paramIndex++}`; params.push(region); }
        if (constituency) { query += ` AND v.constituency = $${paramIndex++}`; params.push(constituency); }
        if (status) { query += ` AND v.enrollment_status = $${paramIndex++}`; params.push(status); }
        if (mandal) { query += ` AND v.mandal = $${paramIndex++}`; params.push(mandal); }
        query += ' ORDER BY v.created_at DESC';
        const result = await pool.query(query, params);
        res.json({ total_count: result.rows.length, voters: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error while fetching voters' });
    }
});

app.get('/api/admin/overview', authenticateToken, requireRoles('super_admin'), async (req, res) => {
    try {
        const [totals, regions, coordinators] = await Promise.all([
            pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE enrollment_status IN ('pending', 'in_progress'))::int AS pending, COUNT(*) FILTER (WHERE enrollment_status = 'approved')::int AS approved, COUNT(*) FILTER (WHERE enrollment_status = 'rejected')::int AS rejected FROM voters`),
            pool.query(`SELECT region, COUNT(*)::int AS count FROM voters WHERE region IN ('Nalgonda', 'Warangal', 'Khammam') GROUP BY region ORDER BY CASE region WHEN 'Nalgonda' THEN 1 WHEN 'Warangal' THEN 2 WHEN 'Khammam' THEN 3 END`),
            pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'constituency_coordinator'`)
        ]);
        res.json({ metrics: { ...totals.rows[0], active_coordinators: coordinators.rows[0].total }, regional_breakdown: regions.rows });
    } catch (err) { res.status(500).json({ error: 'Unable to load admin overview.' }); }
});

app.get('/api/admin/enrollments', authenticateToken, requireRoles('super_admin'), async (req, res) => {
    const { region, constituency, mandal, status, search } = req.query;
    try {
        let query = 'SELECT v.*, u.name AS coordinator_name FROM voters v LEFT JOIN users u ON v.coordinator_id = u.id WHERE 1=1';
        const params = [];
        const add = (condition, value) => { if (value) { params.push(value); query += ` AND ${condition} = $${params.length}`; } };
        add('v.region', region); add('v.constituency', constituency); add('v.mandal', mandal); add('v.enrollment_status', status);
        if (search) { params.push(`%${search}%`); query += ` AND (v.voter_name ILIKE $${params.length} OR v.voter_id ILIKE $${params.length} OR v.mobile_number ILIKE $${params.length})`; }
        query += ' ORDER BY v.created_at DESC LIMIT 1000';
        const result = await pool.query(query, params);
        res.json({ voters: result.rows, total_count: result.rowCount });
    } catch (err) { res.status(500).json({ error: 'Unable to load enrollment feed.' }); }
});

app.get('/api/admin/coordinators', authenticateToken, requireRoles('super_admin'), async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, email, mobile_number, assigned_region, assigned_constituency, assigned_mandal, created_at FROM users WHERE role = 'constituency_coordinator' ORDER BY name`);
        res.json({ coordinators: result.rows });
    } catch (err) { res.status(500).json({ error: 'Unable to load coordinators.' }); }
});

app.get('/api/admin/geography', authenticateToken, requireRoles('super_admin'), async (req, res) => {
    const { region, constituency, mandal, search } = req.query;
    try {
        let query = `SELECT "Old District" AS region, "AC No" AS ac_no, "Assembly Constituency" AS assembly_constituency, "Mandal" AS mandal, "Village" AS village, "Village LGD Code" AS village_lgd_code, "Gram Panchayat" AS gram_panchayat, "Gram Panchayat LGD Code" AS gram_panchayat_lgd_code, "Pincode" AS pincode FROM master_geography WHERE 1=1`;
        const params = [];
        const add = (condition, value) => { if (value) { params.push(value); query += ` AND ${condition} = $${params.length}`; } };
        add('"Old District"', region); add('"Assembly Constituency"', constituency); add('"Mandal"', mandal);
        if (search) { params.push(`%${search}%`); query += ` AND ("Village" ILIKE $${params.length} OR "Mandal" ILIKE $${params.length} OR "Assembly Constituency" ILIKE $${params.length})`; }
        query += ' ORDER BY "Old District", "Assembly Constituency", "Mandal", "Village" LIMIT 10000';
        const result = await pool.query(query, params);
        res.json({ geography: result.rows, total_count: result.rowCount });
    } catch (err) { res.status(500).json({ error: 'Unable to load geography explorer.' }); }
});

app.patch('/api/admin/voters/:id/status', authenticateToken, requireRoles('super_admin'), async (req, res) => {
    const { id } = req.params;
    const { enrollment_status } = req.body;
    try {
        if (!['pending', 'in_progress', 'approved', 'rejected'].includes(enrollment_status)) return res.status(400).json({ error: 'Invalid enrollment status.' });
        const updatedVoter = await pool.query(`UPDATE voters SET enrollment_status = $1 WHERE id = $2 AND enrollment_status IN ('pending', 'in_progress') RETURNING *`, [enrollment_status, id]);
        if (!updatedVoter.rowCount) return res.status(409).json({ error: 'This enrollment status has already been finalized and cannot be changed.' });
        res.json({ message: 'Updated', voter: updatedVoter.rows[0] });
            writeAudit(req.user?.id, 'voter_status_updated', { voter_id: id, enrollment_status });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// NEW GEOGRAPHY ROUTES
app.get('/api/geo/regions', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT "Old District" as region FROM master_geography WHERE "Old District" IS NOT NULL ORDER BY "Old District"');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/geo/assemblies', async (req, res) => {
    try {
        const { region } = req.query;
        const result = region
            ? await pool.query('SELECT DISTINCT "Old District" as region, "AC No" as ac_no, "Assembly Constituency" as assembly_constituency FROM master_geography WHERE "Old District" = $1 ORDER BY "Assembly Constituency"', [region])
            : await pool.query('SELECT DISTINCT "Old District" as region, "AC No" as ac_no, "Assembly Constituency" as assembly_constituency FROM master_geography ORDER BY "Assembly Constituency"');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/geo/mandals', async (req, res) => {
    try {
        const { constituency } = req.query;
        const result = await pool.query('SELECT DISTINCT "Mandal" as mandal FROM master_geography WHERE "Assembly Constituency" = $1 ORDER BY "Mandal"', [constituency]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

    app.get('/api/admin/audit-logs', authenticateToken, requireRoles('super_admin'), async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT a.id, a.action, a.details, a.timestamp, u.name as user_name, u.role
                FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.timestamp DESC LIMIT 200
            `);
            res.json({ logs: result.rows });
        } catch (err) {
            res.status(500).json({ error: 'Server error while fetching audit logs' });
        }
    });

// NEW COORDINATOR ROUTES
app.get('/api/coordinator/history', authenticateToken, requireRoles('constituency_coordinator'), async (req, res) => {
    try {
        const search = String(req.query.search || '').trim();
        const result = await pool.query(
            'SELECT * FROM voters WHERE coordinator_id = $1 AND ($2 = \'\' OR voter_id ILIKE $2) ORDER BY created_at DESC',
            [req.user.id, `%${search}%`]
        );
        res.json({ voters: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/coordinator/voters/:id/status', authenticateToken, requireRoles('constituency_coordinator'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Only approved or rejected status is allowed.' });
        const updatedVoter = await pool.query(`UPDATE voters SET enrollment_status = $1 WHERE id = $2 AND coordinator_id = $3 AND enrollment_status = 'pending' RETURNING *`, [status, id, req.user.id]);
        if (!updatedVoter.rowCount) return res.status(409).json({ error: 'This enrollment status has already been changed and cannot be corrected.' });
        res.json({ voter: updatedVoter.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

const PORT = process.env.PORT || 5000;
ensureVoterColumns()
    .then(() => app.listen(PORT, () => console.log(`Server running on port ${PORT}`)))
    .catch(error => {
        console.error('Database schema initialization failed:', error);
        process.exit(1);
    });