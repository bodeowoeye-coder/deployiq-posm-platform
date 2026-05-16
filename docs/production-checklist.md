# Production Checklist

## Before deployment

1. Run the latest `supabase/schema.sql` in the production Supabase project.
2. Confirm these tables exist:
   - `submissions`
   - `clients`
   - `user_roles`
   - `submission_status_history`
3. Confirm storage bucket `installation-images` exists.
4. Create production Auth users and assign matching `user_roles`.
5. Create client rows and link each client user to the correct `client_id`.
6. Backfill existing submissions to clients where needed.
7. Set all required Vercel environment variables.
8. Run `npm run build`.

## Vercel environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `COMPANY_NAME`
- `COMPANY_LOGO_URL`
- `NEXT_PUBLIC_APP_URL`

## Security notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` private and server-side only.
- `/admin` is restricted to `admin` role users.
- `/client` is restricted to `client` role users.
- Client dashboard queries are scoped by `client_id`.
- Client export routes are separately scoped by `client_id`.
- RLS policies should remain enabled on `submissions`, `clients`, `user_roles`, and `submission_status_history`.
- Review actions are server-side and require an authenticated admin.

## Manual QA checklist

1. Sign in as admin and confirm `/admin` opens.
2. Sign in as client and confirm `/client` opens but `/admin` does not.
3. Upload a new installation from `/submit`.
4. Confirm image, OCR fields, GPS, and timestamps save.
5. Confirm brand/client linkage works.
6. Approve and reject a record as admin.
7. Confirm review history appears.
8. Confirm map markers appear for rows with GPS.
9. Export full and filtered Excel reports.
10. Export full and filtered PDF reports.
11. Confirm client exports contain only client-owned records.
12. Test phone upload on a weak connection and confirm clear retry messaging if a submission fails.
