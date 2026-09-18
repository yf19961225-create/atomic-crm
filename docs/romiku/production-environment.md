# Production configuration — pending user inputs

The intended new origin is `https://crm2.romiku.com`. The existing
`https://crm.romiku.com` and its Supabase project remain untouched. No production
project reference, credentials, DNS record, deployment URL, or website-server
access is recorded or invented here. Local verification does not establish that
these production resources exist.

## Required inputs

| Input | Needed from the owner | Used for |
| --- | --- | --- |
| Supabase | New project organization, name, region, project reference and URL; public publishable key; service-role credential; database connection access | Independent database, Auth and Storage; migrations and Vercel intake |
| Two accounts | Two individual names and email addresses; secure password/invitation delivery | Independent logins with shared ROMIKU business access |
| Vercel | Owning team and a new project; confirmed repository/branch or local deployment source; production access | Vite frontend and Node 22 inquiry function |
| DNS | Provider/zone access for `romiku.com`; approval to add only `crm2` | Use the exact record value Vercel presents; do not guess an IP or CNAME |
| Website server | Actual website origin, PHP handler path, configuration mechanism and operator access | Change only its server-side CRM endpoint URL and shared secret |
| Sanity | Confirmation that the existing public `gxuvcyaa` / `production` catalog is the intended product source and allows the new browser origin | Product lookup and optional inquiry enrichment |
| Auth email | SMTP sender/service configuration if invitations or password recovery are required | Deliver real user account emails and test recovery redirects |

Enter secrets in the appropriate provider's protected settings or a local ignored
environment file. Do not paste them into commits, screenshots, issue text or
readiness reports. The blank `.env.production.example` and `.env.server.example`
are templates, not deployable credentials.

## Vercel variables

| Variable | Scope | Value/source |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public frontend, build time | New project's HTTPS URL |
| `VITE_SB_PUBLISHABLE_KEY` | Public frontend, build time | New project's public publishable/anon key; never its service-role key |
| `VITE_ATTACHMENTS_BUCKET` | Public frontend | `attachments` (created by migrations) |
| `VITE_IS_DEMO` | Public frontend | `false` |
| `VITE_INBOUND_EMAIL` | Public frontend | Empty; email ingestion is outside Today MVP |
| `SUPABASE_URL` | Server function only | Same new project's HTTPS URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server function only | New project's service-role credential |
| `WEBSITE_INQUIRY_SECRET` | Server function only | Newly generated random secret also stored by the website PHP server |

Vite embeds `VITE_*` values in the bundle. Changing them requires a rebuild.
Configure Preview and Production separately; a preview must not silently use the
live production database. Do not copy `.env.development`, `.env.e2e`, or
`supabase/functions/.env` to production: they contain local/demo settings.
The website browser must never receive either server secret.

Sanity project/dataset/API version currently live in
`romikuSanityProductSource.ts` and the inquiry function; there is no configurable
`VITE_SANITY_*` variable or private-token support in this implementation. If the
catalog becomes private or changes project, stop and implement/review a
server-side adapter before release. Do not put a private Sanity token in Vite.

## Supabase setup

Apply migrations to a new empty project only after checking its project reference.
The local PostgreSQL major version is 15; confirm hosted migration compatibility
on the chosen project. Do not seed production with `supabase/seed.sql` or run the
local test/reset commands against a hosted database.

Set Auth Site URL to `https://crm2.romiku.com`. Add only the exact callback and
password-reset URLs used by the app to its redirect allowlist (including
`https://crm2.romiku.com/auth-callback.html` for the existing callback asset);
test recovery with the actual production URL. Pre-create the two confirmed Auth
users through the Supabase dashboard/admin flow, supplying first/last names in
metadata. The existing trigger creates their `sales` rows. Verify both rows and
their names. The first account receives Atomic administrator status; ROMIKU
business tables intentionally grant both authenticated users the same access.
Close public signups before opening the production origin: any authenticated
account has shared ROMIKU access in this MVP.

The core two-user workflow uses Auth and PostgREST directly. If retaining Atomic
user administration/password-email screens, deploy the `users` and
`update_password` Edge Functions and verify them separately. Their runtime uses
Supabase-provided `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, plus
`SB_PUBLISHABLE_KEY` for the new project and, if overriding it,
`SB_JWT_ISSUER=<new-project-url>/auth/v1`. Do not copy the local function env file.
Postmark, MCP and generic Atomic contact functions are not required by the
Today MVP business smoke and must not be enabled by a blanket deployment step.

The inherited `attachments` bucket is public. A storage object's public URL can
be read without login; database RLS does not protect that URL. The smoke suite
does not certify confidential file handling. Do not put private commercial files
there until a private-bucket/signed-URL workflow has been separately implemented
and verified. Today MVP document data and conversion snapshots are database rows.

## Website server configuration

The PHP backend should send JSON to
`https://crm2.romiku.com/api/website-inquiries` with
`X-ROMIKU-Website-Secret` set from its server environment. Preserve the current
browser-to-PHP submission flow. Verify its request fields and response parsing
against [the intake contract](website-inquiry-integration.md) before cutover;
the current PHP source and response consumer have not been provided.

Intake has no idempotency key. A timeout after commit can leave an inquiry saved
without a receipt. Do not introduce automatic blind retries; first check whether
the inquiry was saved. Optional Sanity outages leave the original inquiry intact.
