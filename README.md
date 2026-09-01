# MLC Voter Enrollment Platform

A real-time graduate MLC election enrollment and management platform.

## Features
1. **Coordinator Mobile Web App**: A mobile-first interface for ground coordinators to enroll voters securely.
2. **Super Admin Dashboard**: A high-level control panel to manage the entire campaign, provision coordinators, and review enrollments.

## Prerequisites
- Node.js (v16+)
- PostgreSQL (`mlc_voter_db` must be configured, with credentials set in `index.js`)

## Running the Backend

The backend is built with Node.js and Express, connecting to a PostgreSQL database.

1. Open a terminal.
2. Navigate to the project root:
   ```bash
   cd c:/Users/HP/Desktop/mlc-voter-app
   ```
3. Install backend dependencies (if not already installed):
   ```bash
   npm install
   ```
4. Start the backend server:
   ```bash
   node index.js
   ```
   The backend will run on `http://localhost:5000`.

   ### Supporting document storage

   Supporting documents are uploaded to Supabase Storage, and their public URLs are saved in the `voters.degree_certificate_url` and `voters.degree_certificate_urls` columns. Configure these backend environment variables before using uploads:

   ```env
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
   SUPABASE_STORAGE_BUCKET=voter-documents
   ```

   The service-role key must be configured only on the backend or hosting provider, never in the frontend. The backend creates the `voter-documents` bucket as public on first upload if it does not already exist. Files are limited to two per enrollment and 10 MB per file.

   For the deployed backend, open the Render service for `kingmayker-ems.onrender.com`, go to **Environment**, and add the same three variables there. Render does not read this local `.env` file. After saving the variables, select **Manual Deploy > Deploy latest commit** and wait for the service to finish deploying.

## Running the Frontend

The frontend is built with React, Vite, and Tailwind CSS.

1. Open a new terminal.
2. Navigate to the `frontend` directory:
   ```bash
   cd c:/Users/HP/Desktop/mlc-voter-app/frontend
   ```
3. Install frontend dependencies (if not already installed):
   ```bash
   npm install
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
   The frontend will typically run on `http://localhost:5173`. You can view it in your browser.

## Default Credentials / Routes
- **Super Admin Login**: Use the Super Admin credentials that you have provisioned in the database. 
- The app automatically routes you to the **Super Admin Dashboard** or **Coordinator Portal** based on your role after login.

## Party Leader Analytics

The read-only party leader account is routed to `/leader` after login. The dashboard loads authenticated analytics, status-aware counters, constituency density tiles, mandal/village drill-downs, and an Excel export of the active filters.

To test locally:

1. Start PostgreSQL and the backend with `node index.js` from the project root.
2. Start the frontend with `npm run dev` from `frontend`.
3. Sign in with the provisioned `party_leader` account, for example `leader@kingmayker.com` and its current password.
4. Apply constituency, mandal, village, or status filters, then select **Export Excel**.

Leader endpoints require a valid JWT with the `party_leader` role. Leader requests cannot create users or change voter statuses; those operations require `super_admin`. The current voter data model stores constituency, mandal, and village, but no separate district column, so district filtering is currently represented by the existing constituency groupings.
