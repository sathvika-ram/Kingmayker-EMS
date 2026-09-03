const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const multer = require('multer');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
const allowedOrigins = Array.from(new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://kingmayker-ems-ten.vercel.app',
    ...String(process.env.FRONTEND_URL || '')
        .split(',')
        .map(origin => origin.trim().replace(/\/$/, ''))
        .filter(Boolean)
]));
app.use(cors({ origin: allowedOrigins }));

// PostgreSQL Connection Pool Setup
function getDatabaseConnectionString() {
    const connectionString = String(process.env.DATABASE_URL || '').trim();
    if (!connectionString) throw new Error('DATABASE_URL must be configured.');
    const databaseUrl = new URL(connectionString);
    const isSupabase = databaseUrl.hostname.includes('supabase.co') || databaseUrl.hostname.includes('supabase.com');
    if (isSupabase && process.env.NODE_ENV === 'production' && (databaseUrl.port !== '6543' || databaseUrl.searchParams.get('pgbouncer') !== 'true')) {
        throw new Error('Production Supabase DATABASE_URL must use the pooled connection on port 6543 with pgbouncer=true.');
    }
    return databaseUrl.toString();
}

const pool = new Pool({
    connectionString: getDatabaseConnectionString(),
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});
pool.on('error', error => console.error('PostgreSQL pool error:', error.message));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters.');
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { files: 2, fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (/^(image\/(jpeg|png|jpg)|application\/pdf)$/.test(file.mimetype)) return callback(null, true);
        callback(new Error('Only JPG, PNG, and PDF files are allowed.'));
    }
});

function getSupabaseStorageConfig() {
    const databaseHost = new URL(process.env.DATABASE_URL).username.split('.')[1];
    const projectRef = process.env.SUPABASE_PROJECT_REF || databaseHost;
    return {
        url: (process.env.SUPABASE_URL || `https://${projectRef}.supabase.co`).replace(/\/$/, ''),
        bucket: process.env.SUPABASE_STORAGE_BUCKET || 'voter-documents',
        key: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
}

async function ensureSupabaseBucket(storage) {
    const bucketUrl = `${storage.url}/storage/v1/bucket/${encodeURIComponent(storage.bucket)}`;
    const checkResponse = await fetch(bucketUrl, {
        method: 'GET',
        headers: { apikey: storage.key, Authorization: `Bearer ${storage.key}` }
    });

    if (checkResponse.ok) {
        const patchResponse = await fetch(bucketUrl, {
            method: 'PATCH',
            headers: { apikey: storage.key, Authorization: `Bearer ${storage.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                public: true,
                allowed_mime_types: ['image/jpeg', 'image/png', 'application/pdf']
            })
        });

        if (!patchResponse.ok) {
            const errorText = await patchResponse.text();
            console.warn(`Bucket configuration warning: ${errorText}`);
        }
        return;
    }

    const createResponse = await fetch(`${storage.url}/storage/v1/bucket`, {
        method: 'POST',
        headers: { apikey: storage.key, Authorization: `Bearer ${storage.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: storage.bucket,
            name: storage.bucket,
            public: true,
            allowed_mime_types: ['image/jpeg', 'image/png', 'application/pdf']
        })
    });

    if (!createResponse.ok && createResponse.status !== 400 && createResponse.status !== 409) {
        const errorText = await createResponse.text();
        throw new Error(`Storage bucket setup failed: ${errorText}`);
    }
}

async function ensureVoterColumns() {
    await pool.query(`
        ALTER TABLE voters
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS complete_address TEXT,
        ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
        ADD COLUMN IF NOT EXISTS degree_certificate_url TEXT,
        ADD COLUMN IF NOT EXISTS degree_certificate_urls TEXT[],
        ADD COLUMN IF NOT EXISTS booth_number VARCHAR(30)
    `);
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_region VARCHAR(120)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_mandal VARCHAR(120)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_personal_email VARCHAR(255)');
    await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
    await pool.query('ALTER TABLE voters ALTER COLUMN email DROP NOT NULL');
    await pool.query('ALTER TABLE voters ALTER COLUMN application_type DROP NOT NULL');
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

app.post('/api/uploads', authenticateToken, requireRoles('constituency_coordinator', 'super_admin'), upload.array('files', 2), async (req, res) => {
    if (!req.files?.length) return res.status(400).json({ error: 'Select at least one file to upload.' });
    const storage = getSupabaseStorageConfig();
    if (!storage.key) return res.status(500).json({ error: 'File storage is not configured on the server.' });

    try {
        await ensureSupabaseBucket(storage);

        const urls = [];
        for (const file of req.files) {
            const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `${req.user.id}/${crypto.randomUUID()}-${safeName}`;
            const response = await fetch(`${storage.url}/storage/v1/object/${storage.bucket}/${filePath.split('/').map(encodeURIComponent).join('/')}`, {
                method: 'POST',
                headers: { apikey: storage.key, Authorization: `Bearer ${storage.key}`, 'Content-Type': file.mimetype, 'x-upsert': 'false' },
                body: file.buffer
            });
            if (!response.ok) throw new Error(`Storage upload failed: ${await response.text()}`);
            urls.push(`${storage.url}/storage/v1/object/public/${storage.bucket}/${filePath.split('/').map(encodeURIComponent).join('/')}`);
        }
        res.status(201).json({ urls });
    } catch (error) {
        console.error('Document upload failed:', error.message);
        res.status(502).json({ error: 'Unable to store the uploaded documents.' });
    }
});

app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ status: 'Connected to PostgreSQL successfully', time: result.rows[0].now });
    } catch (err) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
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
    const { name, mobile_number, temp_password, assigned_region, assigned_constituency, assigned_mandal, agent_personal_email, personal_email, generated_login_email } = req.body;
    try {
        const normalizedName = String(name || '').trim();
        const selectedRegion = String(assigned_region || '').trim();
        const selectedConstituency = String(assigned_constituency || '').trim();
        const selectedMandal = String(assigned_mandal || '').trim();
        const personalEmail = String(agent_personal_email || personal_email || '').trim();

        if (!normalizedName || !/^\d{10}$/.test(String(mobile_number || '')) || !temp_password || !selectedConstituency) {
            return res.status(400).json({ error: 'Full name, 10-digit mobile, password, and constituency are required.' });
        }

        const regionLookup = selectedRegion || (await pool.query('SELECT "Old District" FROM master_geography WHERE "Assembly Constituency" = $1 LIMIT 1', [selectedConstituency])).rows[0]?.['Old District'];
        const resolvedRegion = String(regionLookup || '').trim();
        if (!resolvedRegion) return res.status(400).json({ error: 'Please select a valid constituency so the region can be auto-generated.' });

        if (selectedMandal) {
            const geography = await pool.query(
                'SELECT 1 FROM master_geography WHERE "Old District" = $1 AND "Assembly Constituency" = $2 AND "Mandal" = $3 LIMIT 1',
                [resolvedRegion, selectedConstituency, selectedMandal]
            );
            if (!geography.rowCount) return res.status(400).json({ error: 'The selected region, constituency, and mandal do not match.' });
        }

        const coordinatorEmail = String(generated_login_email || buildCoordinatorEmail(normalizedName, selectedConstituency)).trim();
        if (!coordinatorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coordinatorEmail)) {
            return res.status(400).json({ error: 'A valid generated login email is required.' });
        }
        if (personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
            return res.status(400).json({ error: 'Enter a valid personal email address for the agent.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(temp_password, salt);
        const newCoordinator = await pool.query(
            `INSERT INTO users (name, email, mobile_number, password_hash, role, assigned_region, assigned_constituency, assigned_mandal, personal_email, agent_personal_email) 
             VALUES ($1, $2, $3, $4, 'constituency_coordinator', $5, $6, $7, $8, $9) RETURNING id, name, email, mobile_number, assigned_region, assigned_constituency, assigned_mandal, personal_email, agent_personal_email`,
            [normalizedName, coordinatorEmail, mobile_number, passwordHash, resolvedRegion, selectedConstituency, selectedMandal || null, personalEmail || null, personalEmail || null]
        );
        writeAudit(req.user?.id, 'coordinator_created', { coordinator_id: newCoordinator.rows[0].id, assigned_constituency: selectedConstituency, assigned_mandal: selectedMandal });
        res.status(201).json({ message: `Coordinator created. Login email: ${coordinatorEmail}`, coordinator: newCoordinator.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'A coordinator already uses this generated login email.' });
        console.error('Coordinator creation failed:', err);
        res.status(500).json({ error: 'Failed to create coordinator' });
    }
});

app.post('/api/voters/enroll', authenticateToken, requireRoles('constituency_coordinator', 'super_admin'), async (req, res) => {
    // Handling both sets of fields from the modified form
    const {
        voter_id, voter_name, father_name, date_of_birth, mobile_number, email, gender, nationality,
        degree_qualification, graduation_year, form18_number, acknowledgement_number, reference_number, region,
        constituency, booth_number, mandal, house_number, street, complete_address, village, district, state, pincode, degree_certificate_url, degree_certificate_urls, notes
    } = req.body;
    try {
        const numericCoordinatorId = req.user.role === 'constituency_coordinator'
            ? Number(req.user.id)
            : Number(req.body.coordinator_id);
        if (!Number.isFinite(numericCoordinatorId) || numericCoordinatorId <= 0) {
            return res.status(400).json({ error: 'Invalid coordinator session. Please log in again.' });
        }

        const isAllAccessAgent = req.user.role === 'constituency_coordinator' && (req.user.constituency === 'All' || req.user.region === 'All' || !req.user.constituency || !req.user.region);
        if (req.user.role === 'constituency_coordinator' && !isAllAccessAgent && (constituency !== req.user.constituency || (req.user.region && region !== req.user.region) || (req.user.mandal && mandal !== req.user.mandal))) {
            return res.status(403).json({ error: 'You can enroll voters only in your assigned geography' });
        }
        if (req.user.role === 'super_admin') {
            const coordinator = await pool.query('SELECT id FROM users WHERE id = $1 AND role = \'constituency_coordinator\'', [numericCoordinatorId]);
            if (!coordinator.rowCount) return res.status(400).json({ error: 'Select a valid coordinator for this enrollment.' });
        }
        if (!voter_id || !voter_name || !father_name || !date_of_birth || !/^\d{10}$/.test(String(mobile_number || '')) || !gender || !degree_qualification || !graduation_year || !acknowledgement_number || !complete_address || !village || !district || !pincode || !booth_number) {
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
        const primaryDocumentUrl = documentUrls[0] || '';

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
                mobile_number, citizenship_status, constituency, booth_number, mandal,
                village, degree_qualification, graduation_year, degree_certificate_url, degree_certificate_urls, enrollment_status,
                voter_id, gender, email, nationality,
                form18_number, acknowledgement_number, reference_number, house_number, street,
                complete_address, district, state, pincode, region, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending',
                $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING *`,
            [
                numericCoordinatorId, voter_name, father_name, date_of_birth,
                mobile_number, true, constituency, booth_number, mandal,
                village, degree_qualification, graduation_year, primaryDocumentUrl, documentUrls,
                voter_id, gender, voterEmail, nationality,
                form18_number, acknowledgement_number, reference_number, house_number, street,
                complete_address || [house_number, street].filter(Boolean).join(', '), district, state, pincode, region, notes
            ]
        );
        res.status(201).json({ message: 'Enrolled', voter: newVoter.rows[0] });
            writeAudit(req.user.id, 'voter_enrolled', { voter_id: newVoter.rows[0].id, constituency, mandal });
    } catch (err) {
        console.error('Voter enrollment failed:', err);
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