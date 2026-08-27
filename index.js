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
    user: 'postgres',
    host: 'localhost',
    database: 'mlc_voter_db',
    password: 'sath',
    port: 5432,
});

async function ensureVoterColumns() {
    await pool.query(`
        ALTER TABLE voters
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS complete_address TEXT
    `);
        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20)');
        await pool.query('ALTER TABLE users ALTER COLUMN email DROP NOT NULL');
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
    jwt.verify(token, 'YOUR_SECRET_JWT_KEY', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
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
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });
        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, constituency: user.assigned_constituency },
            'YOUR_SECRET_JWT_KEY',
            { expiresIn: '12h' }
        );

            res.json({ message: 'Login successful', token, role: user.role, name: user.name, assigned_constituency: user.assigned_constituency });
            writeAudit(user.id, 'user_login', { role: user.role });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.post('/api/admin/create-coordinator', authenticateToken, async (req, res) => {
    const { name, email, temp_password, assigned_constituency } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(temp_password, salt);
            const newCoordinator = await pool.query(
                `INSERT INTO users (name, email, mobile_number, password_hash, role, assigned_constituency) 
                 VALUES ($1, NULLIF($2, ''), $3, $4, 'constituency_coordinator', $5) RETURNING id, name, email, mobile_number, assigned_constituency`,
                [name, email || '', mobile_number, passwordHash, assigned_constituency]
        );
            writeAudit(req.user?.id, 'coordinator_created', { coordinator_id: newCoordinator.rows[0].id, assigned_constituency });
        res.status(201).json({ message: 'Created successfully', coordinator: newCoordinator.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create coordinator' });
    }
});

app.post('/api/voters/enroll', async (req, res) => {
    // Handling both sets of fields from the modified form
    const {
        coordinator_id, voter_name, father_name, date_of_birth, mobile_number, email, nationality, application_type, university, college, course,
        degree_qualification, graduation_year, form18_number, acknowledgement_number, reference_number, region,
        constituency, mandal, house_number, street, complete_address, village, district, state, pincode, degree_certificate_url, notes
    } = req.body;
    try {
        const newVoter = await pool.query(
            `INSERT INTO voters (
                coordinator_id, voter_name, father_name, date_of_birth, 
                mobile_number, citizenship_status, constituency, mandal, 
                village, degree_qualification, graduation_year, degree_certificate_url, enrollment_status,
                voter_id, gender, email, nationality, application_type, university, college, course,
                form18_number, acknowledgement_number, reference_number, house_number, street,
                complete_address, district, state, pincode, region, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending',
                $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
            RETURNING *`,
            [
                coordinator_id, voter_name, father_name, date_of_birth,
                mobile_number, true, constituency, mandal,
                village, degree_qualification || course, graduation_year, degree_certificate_url,
                voter_id, gender, email, nationality, application_type, university, college, course,
                form18_number, acknowledgement_number, reference_number, house_number, street,
                complete_address || [house_number, street].filter(Boolean).join(', '), district, state, pincode, region, notes
            ]
        );
        res.status(201).json({ message: 'Enrolled', voter: newVoter.rows[0] });
            writeAudit(coordinator_id, 'voter_enrolled', { voter_id: newVoter.rows[0].id, constituency, mandal });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error while processing voter enrollment' });
    }
});

app.get('/api/admin/voters', async (req, res) => {
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

app.patch('/api/admin/voters/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { enrollment_status } = req.body;
    try {
        const updatedVoter = await pool.query(`UPDATE voters SET enrollment_status = $1 WHERE id = $2 RETURNING *`, [enrollment_status, id]);
        res.json({ message: 'Updated', voter: updatedVoter.rows[0] });
            writeAudit(req.user?.id, 'voter_status_updated', { voter_id: id, enrollment_status });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// NEW GEOGRAPHY ROUTES
app.get('/api/geo/regions', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT old_district as region FROM master_geography WHERE old_district IS NOT NULL ORDER BY old_district');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/geo/assemblies', async (req, res) => {
    try {
        const { region } = req.query;
        const result = region
            ? await pool.query('SELECT DISTINCT ac_no, assembly_constituency FROM master_geography WHERE old_district = $1 ORDER BY assembly_constituency', [region])
            : await pool.query('SELECT DISTINCT ac_no, assembly_constituency FROM master_geography ORDER BY assembly_constituency');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/geo/mandals', async (req, res) => {
    try {
        const { constituency } = req.query;
        const result = await pool.query('SELECT DISTINCT mandal FROM master_geography WHERE assembly_constituency = $1 ORDER BY mandal', [constituency]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

    app.get('/api/admin/audit-logs', authenticateToken, async (req, res) => {
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
app.get('/api/coordinator/history', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM voters WHERE coordinator_id = $1 ORDER BY created_at DESC', [req.user.id]);
        res.json({ voters: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.patch('/api/coordinator/voters/:id/status', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const updatedVoter = await pool.query(`UPDATE voters SET enrollment_status = $1 WHERE id = $2 AND coordinator_id = $3 RETURNING *`, [status, id, req.user.id]);
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