# Mobile-first AI Deployment Reporting System

This is a complete Next.js starter system for nationwide dealer board installation reporting.

Installers use a phone-friendly page to upload an installed board photo. The app captures GPS coordinates and timestamp automatically, compresses the image, sends the image to OpenAI vision for text extraction, and stores the report in Supabase. Admin users can view totals, region charts, daily uploads, recent submissions, and export reports.

## Main Features

- Mobile installer upload page
- Automatic GPS and timestamp capture
- Client-side image compression for poor internet conditions
- OpenAI vision extraction for salon/store name, address, state/region, and visible text
- Supabase database and image storage
- Admin dashboard with region and daily upload charts
- Brand analytics across linked enterprise brands
- Search/filter by date range, installer, region, brand, and status
- Full and filtered Excel/PDF export routes
- Future-ready structure for logins, installer performance, duplicate detection, and live maps

## Quick Start

1. Run the Supabase SQL in `supabase/schema.sql`.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase and OpenAI keys.
4. Install dependencies:

```bash
npm install
```

5. Start locally:

```bash
npm run dev
```

6. Open `http://localhost:3000/submit`.

## Pages

- `/submit` - installer upload form
- `/admin` - reporting dashboard

## API Routes

- `POST /api/submissions` - stores image, extracts text, creates database row
- `GET /api/exports/excel` - downloads Excel workbook
- `GET /api/exports/pdf` - downloads PDF summary

## Important Security Note

The starter dashboard is intentionally simple. Before using this in production, add admin authentication so only approved project managers can open `/admin` and exports.

See `docs/setup-guide.md` for the plain-English setup guide.
See `docs/supabase-connection-guide.md` for the exact Supabase connection steps and saved fields.
See `docs/production-checklist.md` before deploying to Vercel.
