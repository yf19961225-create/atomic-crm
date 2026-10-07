# Website Inquiry → CRM → Quote (Preview QA)

The gated website QA package is documented in [website-qa/README.md](../../website-qa/README.md).
The public website submit flow and old CRM endpoint are not changed by this package.
Only the existing CRM branch Preview and Supabase project `ciwaibtotispazfviims` are in scope.

## Server configuration

The Vercel Node intake function is `POST /api/website-inquiries`.
Server-only variables are `WEBSITE_INQUIRY_SECRET`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY`. Use the named Preview Supabase URL. The PHP backend
sends `X-ROMIKU-Website-Secret`; the browser never receives this credential.
Do not prefix secrets with `VITE_`, commit populated environment files, or log
headers, customer payloads, credentials, or upstream error bodies. No browser CORS
is enabled. Plain Vite does not serve these Node functions.

## Normalized payload and receipt

PHP resolves each SKU against the website static catalog before calling CRM.
Browser image/product metadata is not authoritative. Customer quantities and
requirements are retained; catalog metadata is saved at submission time.

```json
{
  "submissionId": "00000000-0000-4000-8000-000000000001",
  "customerName": "QA Buyer",
  "company": "ABC Nails",
  "brand": "ABC",
  "email": "qa@example.com",
  "whatsapp": "+57 300 123 4567",
  "country": "Colombia",
  "message": "General requirement",
  "items": [{
    "sku": "SUN5",
    "productName": "Saved product name",
    "image": "https://romiku.com/images/products-local/sun5_main.jpg",
    "specification": "Saved specification",
    "quantity": 120,
    "requirement": "White packaging",
    "unit": "pcs",
    "cartonQty": 24
  }]
}
```

`brand`, `company`, `whatsapp`, `unit`, `cartonQty`, and `cartonCbm` are optional.
WhatsApp remains text, preserving `+` and country code. Country is required.
The API validates at most 100 items and a 1 MiB body; numeric quantities must be
positive, below 10^14 and exactly representable at four decimal places. The PHP
QA adapter uses a more conservative numeric ceiling. Unknown payload keys are
stripped by the API. Empty image is allowed when no reliable image exists;
nonempty images must use the website products-local path.

After the transaction commits, HTTP 201 (new) or 200 (replay) returns:

```json
{
  "success": true,
  "replay": false,
  "id": "saved-inquiry-uuid",
  "document_number": "WI-000123",
  "submitted_at": "saved timestamp",
  "normalizedSubmission": { "...": "original saved normalized payload" }
}
```

The first submission for a UUID wins. A unique `submission_id` plus transaction
advisory lock serializes concurrent retries. Replay returns the original snapshot
and date, even if the retried body differs. A new UUID with the same email creates
a separate Inquiry. Legacy records may retain a null submission ID; new HTTP
requests require a UUID. The database RPC retains the legacy no-ID path only for
compatibility with existing trusted callers.

Errors use fixed `{success:false,error}` codes: 400 malformed JSON, 401 unauthorized,
405 unsupported method, 413 oversized body, 415 wrong content type, 422 invalid
payload, and 503 unavailable persistence/configuration. Responses are `no-store`.

## Persistence and snapshot boundary

Migration: `20261006190000_inquiry_quote_snapshots.sql`.
`romiku_submit_website_inquiry(jsonb)` uses SECURITY INVOKER, a fixed empty search
path and fully qualified objects; only service_role can call it. One transaction
saves the header and ordered items. New Inquiry status is `pending_screening`,
owner is null, and the existing status-history machinery remains in effect.
There is no Sanity enrichment, automatic Quote, Formal Customer, or status sync.

Original customer fields, submitted product snapshots, quantities and requirements
remain immutable. Item `product_snapshot` stores name, image_url, specification,
unit and reliable carton defaults. There is no later Product Library lookup.

The explicit “创建报价单” operation copies independent customer and item snapshots.
Quote stores `source_website_inquiry_id`; each copied item saves numeric
`requested_quantity_snapshot`. This source quantity is immutable and separate
from editable Quote quantity. Direct Quote items use null. Legacy missing source
quantities remain blank; export never guesses or backfills from a live Inquiry.
Inquiry and Quote details link to each other by WI/RFQ business number.

## Attachments and mail

`POST /api/website-inquiry-xlsx` accepts `{id,submissionId}` with the same server
secret. It fails closed outside the named Preview, verifies the saved ID pair,
and renders only saved header/items. Product images use their saved URLs, bounded
PNG/JPEG loading and no redirects. The endpoint returns the internal XLSX only to
the authenticated PHP backend; it is not a customer attachment endpoint.

Three separate canonical packages are used:

| Purpose | Package | Product columns |
| --- | --- | --- |
| Internal Inquiry | `inquiry-templates/ROMIKU_网站询盘_模板.xlsx` | A:I, Request Qty F, price H blank |
| Direct Quote | `quote-templates/ROMIKU_报价单_模板.xlsx` | A:H, no Request Qty |
| Website-source Quote | `quote-templates/ROMIKU_报价单_网站询盘来源模板.xlsx` | A:I, saved Request Qty F, Quote price H |

Packages live under `src/assets/`. The saved source FK chooses the Quote template.
All use the template worksheet name `ROMIKU PI` and products from row 9.
Internal Inquiry uses WI number/saved submitted date; both Quote variants use
RFQ number/saved Quote date. Seller details remain the template values. Customer
company/contact are both retained. Internal Inquiry does not guess address or
website. PI, Order, Production and Packing renderers are outside this change.

PHP waits for CRM success before requesting the attachment or processing mail.
Mail and XLSX use the original normalized receipt, not a recomputed retry body.
CRM failure retains the browser draft/cart/UUID and never shows ordinary success.
Durable receipt/mail state prevents repeat CRM creation and known duplicate sends.
An uncertain SMTP acceptance requires reconciliation rather than blind resend.

QA defaults to capturing both messages without delivery. The optional
`internal-only` mode sends only to `info@romiku.com` through a private configured
mailer; customer messages remain captured. Internal mail contains customer fields,
Request Qty and carton quantity with the internal XLSX. Customer confirmation has
a simple SKU/name/quantity list, no internal fields, no UUID and no attachment.
Capture tests are not evidence of real mailbox delivery.

## Verification

Run server API tests, frontend browser tests, pgTAP, typecheck, lint and build.
`website-qa` provides offline PHP/JavaScript tests (including real two-process
idempotency and gated HTTP validation); see its README for Docker PHP execution.
The opt-in local database tests use disposable local PostgreSQL only. Preview
migration is a separate step through the hidden Session Pooler helper after checks.
The user confirmed the two desktop source templates; canonicalization and 1/5/20 export regression are complete.
Real hosted QA and internal mailbox acceptance remain separate from offline tests.
