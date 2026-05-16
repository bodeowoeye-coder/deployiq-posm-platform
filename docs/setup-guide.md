# Setup Guide

This guide is written for a non-technical project owner or operations manager.

## What this system does

Installers open a phone link, choose the brand if known, take a picture of the installed dealer board, and press submit. The system captures the phone location, date, and time, compresses the image, reads visible store or salon text using OpenAI vision, saves the record in Supabase, and shows totals in an admin dashboard.

## Accounts you need

1. A Supabase account for the reporting database and image storage.
2. An OpenAI API key for image text extraction.
3. A Vercel account for hosting the website.

## User access

The app now supports:

- `admin` users for the full operations dashboard
- `client` users for brand/client-specific reporting
- `installer` users for future installer-specific workflows

Clients only see submissions linked to their own `client_id`.

## Supabase setup

1. Create a new Supabase project.
2. Open the SQL editor.
3. Paste the contents of `supabase/schema.sql`.
4. Run the SQL.
5. Open Project Settings, then API.
6. Copy these values:
   - Project URL
   - anon public key
   - service role key

Keep the service role key private. Do not send it to installers.

After creating Auth users in Supabase, add matching rows to:

- `clients`
- `user_roles`

For client users, connect `user_roles.client_id` to the correct `clients.id`.

Example setup order:

1. Create the enterprise client row, for example `Godrej Nigeria Ltd`.
2. Add each owned brand to `brands`, pointing to the same `client_id`.
3. Create the Auth user in Supabase Authentication.
4. Add one `user_roles` row using that Auth user's UUID, role `client`, and the matching `client_id`.
5. Existing submissions can be linked by running:

```sql
update public.submissions
set client_id = brands.client_id
from public.brands
where submissions.client_id is null
  and submissions.brand_name = brands.brand_name;
```

To add more brands later:

```sql
insert into public.brands (client_id, brand_name)
select id, 'NewBrand'
from public.clients
where name = 'Godrej Nigeria Ltd';
```

To add another enterprise client later:

```sql
insert into public.clients (name) values ('Another Client Ltd');

insert into public.brands (client_id, brand_name)
select id, 'ClientBrand'
from public.clients
where name = 'Another Client Ltd';
```

For a focused database connection walkthrough, see `docs/supabase-connection-guide.md`.

## OpenAI setup

1. Create or open your OpenAI platform account.
2. Create an API key.
3. Keep the key private.

The app uses OpenAI image inputs through the Responses API to extract visible salon/store name, address text, state or region, and all visible text from each photo.

The default model setting is `gpt-5.2`. You can change `OPENAI_MODEL` later without editing the app code.

## Local setup

1. Install Node.js LTS.
2. Open this project folder.
3. Create a file named `.env.local`.
4. Copy the values from `.env.example` into `.env.local`.
5. Replace the placeholder values with your Supabase and OpenAI keys.
6. Install packages with `npm install`.
7. Start the app with `npm run dev`.
8. Open `http://localhost:3000`.

## Installer workflow

1. Installer opens `/submit` on a phone browser.
2. Installer enters their name if required.
3. Installer selects the brand if known.
4. Installer takes or selects a board photo.
5. The phone asks for location permission.
6. Installer taps Submit report.
7. The office sees the upload in `/admin`.

## Admin workflow

1. Open `/admin`.
2. Review total completed installations.
3. Check region and daily upload charts.
4. Filter by date, state/region, installer, brand, or status.
5. Assign missing brand names and approve or reject submissions.
6. Download full or filtered Excel and PDF reports from the dashboard buttons.

## Client workflow

1. Client opens `/login`.
2. Client signs in with their Supabase Auth credentials.
3. Client is sent to `/client`.
4. Client sees only submissions linked to their own client record.
5. Client can filter and export their own PDF and Excel reports.

## Deploy on Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, import the repository.
3. Add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`
   - `COMPANY_NAME`
   - `COMPANY_LOGO_URL`
   - `NEXT_PUBLIC_APP_URL`
4. Deploy.
5. Share the Vercel `/submit` link with installers.
6. Share the `/admin` link only with project managers.

## Poor internet recommendations

- Ask installers to stand still until location is captured.
- The app compresses photos before upload to reduce data usage.
- Use clear close-up photos so the AI can read text with fewer retries.
- If a submission fails, the installer can submit again with the same photo.
- The upload page keeps the workflow minimal and shows a clear submission state while sending.

## Production hardening checklist

- Create real admin and client user accounts before sharing dashboards.
- Link each client to the correct brand/client record.
- Add installer login or one-time installer links when assigning territories.
- Add duplicate detection for repeated photos.
- Add offline queueing if field teams often work without connectivity.

See `docs/production-checklist.md` for the current release-readiness checklist, environment variables, security notes, and QA steps.
