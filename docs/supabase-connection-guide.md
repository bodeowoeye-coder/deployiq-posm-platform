# Supabase Connection Guide

Use this guide to connect installer submissions to Supabase.

## Data saved for every submission

The app writes each upload to the `submissions` table with these key fields:

| Field | Supabase column |
| --- | --- |
| Installer name | `installer_name` |
| Brand name | `brand_name` |
| Uploaded image URL | `image_url` |
| Uploaded image storage path | `image_path` |
| GPS latitude | `gps_latitude` |
| GPS longitude | `gps_longitude` |
| Timestamp | `captured_at` |
| Date | `installation_date` |
| Time | `installation_time` |
| Extracted OCR text | `ocr_text` |

The app also stores AI helper fields: `salon_name`, `address`, `state_region`, `status`, and `ai_raw_text`.

## Step 1: Create Supabase project

1. Go to Supabase.
2. Create a new project.
3. Wait for the project to finish provisioning.

## Step 2: Create the database table and image bucket

1. Open the Supabase SQL editor.
2. Open `supabase/schema.sql` in this project.
3. Paste the full SQL into Supabase.
4. Run it.

This creates:

- `submissions` table
- `clients` table
- `brands` table
- `user_roles` table
- `installation-images` storage bucket
- indexes for dashboard filtering
- storage policies for image viewing and upload
- database policy for server-side writes
- client-scoped read policies for portal access

## Brand to client mapping

Use `clients` for enterprise owners and `brands` for the brands they own.

Example:

```sql
insert into public.clients (name)
values ('Godrej Nigeria Ltd')
on conflict (name) do nothing;

insert into public.brands (client_id, brand_name)
select clients.id, brand_names.brand_name
from public.clients
cross join (
  values ('Darling'), ('MegaGrowth'), ('TURA'), ('FreshGlow'), ('GK')
) as brand_names(brand_name)
where clients.name = 'Godrej Nigeria Ltd'
on conflict (brand_name) do nothing;
```

Installer submissions keep `brand_name` for reporting, while `client_id` is filled automatically from the matching row in `brands`.

## Step 3: Copy Supabase keys

Open Supabase Project Settings, then API, and copy:

- Project URL
- anon public key
- service role key

The service role key must stay private. It belongs only in the app environment variables.

## Step 4: Add environment variables

Create `.env.local` in the project folder and add:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5.2
COMPANY_NAME=Your Company Name
COMPANY_LOGO_URL=https://your-domain.com/logo.png
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 5: How submission saving works

1. Installer opens `/submit`.
2. Installer selects or takes a board photo.
3. The browser captures GPS coordinates and timestamp.
4. The app compresses the photo before upload.
5. `POST /api/submissions` uploads the image to Supabase Storage.
6. OpenAI extracts visible OCR text from the uploaded image.
7. The route inserts the full record into Supabase `submissions`.
8. Admin users can later update `brand_name` and `status` from the dashboard.

## Step 6: Confirm it works

1. Start the app.
2. Submit one test upload from `/submit`.
3. Open Supabase Table Editor.
4. Check the `submissions` table.
5. Confirm these columns are filled:
   - `installer_name`
   - `brand_name`
   - `image_url`
   - `gps_latitude`
   - `gps_longitude`
   - `captured_at`
   - `ocr_text`

If OCR text is blank, check that the image has readable text and that `OPENAI_API_KEY` is correct.

## If uploads do not appear on the dashboard

1. Open `/api/admin/diagnostics` in the deployed app.
2. If `submissionCount` is `0`, the dashboard has no rows to display.
3. If the response shows a database error mentioning a missing column such as `brand_name` or `ocr_text`, run the latest `supabase/schema.sql` in the Supabase SQL editor.
4. After updating the schema, submit one new test upload.
5. Reopen `/api/admin/diagnostics` and confirm the count increases.

The upload route removes the uploaded image again if the database insert fails, so new failed submissions should no longer leave orphaned storage files behind.

## Admin filters and exports

The dashboard can filter by:

- date range
- region/state
- installer
- brand
- status
- search text

The full export buttons ignore filters. The filtered export buttons send the active filter values to the export route and only download the matching dashboard data.
