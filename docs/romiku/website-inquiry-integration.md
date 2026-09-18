# Website inquiry intake

`POST /api/website-inquiries` is a Vercel Node function in
`api/website-inquiries.ts`. The Vite SPA builds into `dist`; `vercel.json`
rewrites application navigation to `index.html` while excluding `/api` and its
descendants. Use Node 22 in the Vercel project settings. The planned production
hostname is `crm2.romiku.com`; this change does not deploy it or modify
the existing `crm.romiku.com` integration.

This follows Vercel's [Node function Web handler](https://vercel.com/docs/functions/runtimes/node-js)
and [Vite deployment](https://vercel.com/docs/frameworks/frontend/vite) conventions.
Plain `vite` serves the frontend only. Use `vercel dev` for the combined local
adapter after configuring a local Vercel project, or run the handler integration
test below without a Vercel account.

## Server configuration

Set these only in the Vercel function environment, with separate values for each
deployment environment. Blank placeholders are in `.env.server.example`.

| Variable | Purpose |
| --- | --- |
| `WEBSITE_INQUIRY_SECRET` | Shared credential sent by the website PHP backend |
| `SUPABASE_URL` | Supabase project URL used by the server function |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role credential |

Use a randomly generated secret and put the same value in the website backend's
server configuration. Never use a `VITE_` prefix for these credentials, put them
in frontend code, or commit populated environment files. Local values belong in
ignored `.env.local`. The browser continues to submit to the website PHP backend;
only that backend sends `X-ROMIKU-Website-Secret` to CRM. CORS access is not enabled.
Sanity enrichment uses the existing public ROMIKU catalog and needs no private key.

Missing server configuration fails closed with HTTP 503. The service-role key is
used only in the Vercel function's Supabase requests. The function does not return
or log credentials, request headers, raw customer data, or upstream error details.
Rejected requests log a fixed event/code; enrichment failures log a fixed event.

## Compatible request and response

Send `Content-Type: application/json` and `X-ROMIKU-Website-Secret`:

```json
{
  "customerName": "Customer name",
  "email": "customer@example.com",
  "whatsapp": "+57 123",
  "country": "Colombia",
  "message": "General requirement",
  "items": [
    { "sku": "SUNS15", "quantity": 20, "requirement": "White packaging" }
  ]
}
```

The existing request works unchanged. `company` is an optional string. The five
customer fields and every item's `sku`, `quantity`, and `requirement` are required.
`message`, `requirement`, and optional `company` may be empty strings. Identity,
country, WhatsApp and SKU must be nonblank; email must have a basic address shape.
No submitted strings are trimmed or rewritten. Each positive numeric quantity
must fit `numeric(18,4)` without rounding (less than 10^14, at most four decimal
places). String quantities are rejected. Limits: 1 MiB JSON body, 1–100 items,
200 characters for customer/company/SKU, 320 for email, 100 for WhatsApp/country,
and 10,000 for message/item requirement.

HTTP 201 is returned only after the database commits the entire submission:

```json
{
  "success": true,
  "id": "a generated UUID",
  "document_number": "WI-000123"
}
```

No existing website response parser was available to inspect. The documented
response uses an explicit 2xx status and `success: true`; verify the PHP consumer
against this response before switching its configured CRM URL.

Errors have `{ "success": false, "error": "fixed_code" }`: 400 invalid JSON,
401 invalid/missing secret, 405 unsupported method (`Allow: POST`), 413 body too
large, 415 non-JSON content, 422 invalid fields, and 503 unavailable persistence
or server configuration. All responses disable caching. There are no automatic
retries or idempotency keys: identical submissions produce independent inquiries.
If the network fails after a database commit, the caller may not receive the
receipt; a manual retry can create another independent inquiry.

## Persistence and enrichment

Apply `20260918012451_romiku_website_intake.sql` before enabling the endpoint.
`romiku_submit_website_inquiry(payload jsonb)` is a SECURITY INVOKER function with
an empty fixed search path and explicitly qualified tables. Only `service_role`
has EXECUTE; `PUBLIC`, `anon` and `authenticated` are revoked. The migration
contains explicit grants/revocations because the schema diff generator omits
some inherited privilege changes.

The RPC validates shapes and quantities itself, then inserts one inquiry and
every item in one transaction. Any insertion failure rolls everything back.
It returns `id` and `document_number`. The database supplies numbering, timestamps
and initial `new` status. Owner is explicitly null, and service calls without a
user retain null audit-user references. Submitted ownership/status/link fields
are retained only in raw JSON and cannot override these defaults.

`raw_payload` preserves the complete parsed business JSON, including extra
fields and original item order/details. JSON whitespace/object-key order is not
preserved by JSONB. HTTP headers are never added. Item rows retain exact source
SKU, numeric quantity and requirement. Existing immutable-original triggers
remain enforced. No Outbound, Formal Customer, Quote, mail or Excel processing
occurs.

After persistence, one public Sanity query finds the requested SKUs; metadata
updates have a shared two-second deadline and bounded concurrency. Matches save
the product snapshot and Sanity ID; missing products become `not_found`.
If lookup or metadata updates fail, the committed inquiry still returns success;
any untouched items remain `unresolved` for later review. Metadata updates are
scoped by the saved inquiry ID and literal SKU and never write original fields.

## Verification

```sh
npx vitest run --project server
npx supabase test db supabase/tests/romiku_website_intake.test.sql
ROMIKU_TEST_LOCAL_DB=1 npx vitest run --project server server/websiteInquiries.local.test.ts
npx supabase db diff --local
make typecheck
make lint
make build
CI=1 make test
```

The opt-in local handler test obtains disposable local credentials from
`supabase status`, only permits `127.0.0.1:54321`, uses the named
`supabase_db_atomic-crm-demo` Docker database, and simulates unavailable Sanity.
It verifies real PostgREST/RPC persistence and removes only its UUID-marked
fixtures in a local cleanup transaction. SQL tests roll back all fixtures and
include an injected late item failure to prove complete transaction rollback.
Neither test needs production credentials. The fixed Atomic harness exception
in `baseline-exception.md` continues to govern the full-suite result.

Deployment, the new hostname/DNS, actual production secrets and the website PHP
URL switch remain release work; none is performed by this task.
