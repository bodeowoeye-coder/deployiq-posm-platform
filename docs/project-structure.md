# Project Structure

```text
app/
  submit/page.tsx              Mobile installer upload page
  admin/page.tsx               Admin dashboard page
  api/submissions/route.ts     Upload, image storage, AI extraction, database insert
  api/exports/excel/route.ts   Excel export
  api/exports/pdf/route.ts     PDF export
components/
  AdminDashboard.tsx           Charts, filters, recent submissions
lib/
  ai.ts                        OpenAI Vision/OCR extraction
  imageCompression.ts          Phone-side image compression before upload
  reporting.ts                 Region and daily count helpers
  supabaseAdmin.ts             Private server-side Supabase client
  supabaseClient.ts            Public browser Supabase client
  types.ts                     Shared TypeScript data types
supabase/
  schema.sql                   Database, indexes, storage bucket, policies
docs/
  setup-guide.md               Step-by-step guide for non-technical users
```

## Future-ready areas

- Client login portal: add authenticated pages under `app/client`.
- Installer performance tracking: add installer IDs and aggregate reports on `submissions`.
- AI duplicate image detection: add an image fingerprint field and a background duplicate check.
- Live deployment map: add a map component that reads `gps_latitude` and `gps_longitude`.
