# Controlled Website Inquiry QA

This isolated package adds a gated Namecheap PHP QA page and endpoint. It does not change the public website files, the public submit flow, any CRM schema, or any exporter. It creates Website Inquiries only; it never creates a Quote or Formal Customer.

## Deploy layout and prerequisites

Deploy `public/` as the **document root of a separately gated QA subdomain**, with `lib/` one directory above it. Do not copy this whole directory under `public_html`: library/state files must not be web-accessible. Keep the original website's `outputs/app.js`, `outputs/inquiry.html`, `outputs/api/submit-rfq.php`, PHP configuration and secrets untouched.

Requires PHP 8.1+ with cURL/TLS and sessions, HTTPS, writable private storage outside every public document root, and server environment variables. The state directory must be on persistent local storage with working `flock` and atomic `rename`; multiple PHP workers must share it. Use permissions `0700` for that directory, `0600` for its files. Back up this directory with the CRM operational state and retain it for the supported retry period. It contains customer data and private workbook captures. Never expose it via a download URL or put it in Git.

Server-only configuration (no real credentials are included here):

| Variable | Value / purpose |
| --- | --- |
| `ROMIKU_QA_ENABLED` | `1` explicitly enables QA; absent = HTTP 404 |
| `ROMIKU_QA_PASSWORD_HASH` | PHP `password_hash` value for QA Basic-auth user `romiku-qa`; configure privately |
| `ROMIKU_QA_PRIVATE_DIR` | Absolute existing private writable directory outside the document root |
| `ROMIKU_QA_CATALOG_PATH` | Absolute path to the current deployed website `products-data.js` (static JSON assignment) |
| `ROMIKU_QA_CRM_ENDPOINT` | `https://romiku-crm-prod-git-codex-c-3bcd01-feng-yangs-projects-d31d0be2.vercel.app/api/website-inquiries` |
| `ROMIKU_QA_VERCEL_BYPASS_SECRET` | Optional existing Vercel automation bypass credential; sent as `x-vercel-protection-bypass` only to the exact allowlisted Preview host for intake and attachment requests. Configure only in the PHP server environment; never a URL, browser field, response or log. CR/LF values are rejected; absent preserves the existing headers. |
| `ROMIKU_QA_WEBSITE_SECRET` | Shared server-only `X-ROMIKU-Website-Secret` credential, at least 24 characters; same value in the CRM Preview server environment |
| `ROMIKU_QA_MAIL_MODE` | `capture` (default), or explicitly `internal-only` / `controlled-test` |
| `ROMIKU_QA_MAILER_FILE` | In internal-only mode, absolute private PHP file under `ROMIKU_QA_PRIVATE_DIR`, returning a callable; described below |
| `ROMIKU_QA_LOCAL_HTTP` | `1` permits HTTP **only from loopback**, for local UI tests; leave unset on hosted QA |

The Preview host is hardcoded as an exact allowlist, including scheme and API path. Redirects are disabled and TLS verification is on. Old CRM, production domains, arbitrary Vercel deployments and browser-supplied URLs are rejected. If branch deployment protection blocks server requests, configure its existing automation bypass using `ROMIKU_QA_VERCEL_BYPASS_SECRET`. Do not change Vercel project protection or weaken the host allowlist. The bypass is never sent to any other host, including redirect targets, because redirects remain disabled. Secrets, remote response bodies and SMTP errors are never printed or logged by this package. The server must retain its normal PHP production settings (`display_errors=Off`, protected logs) and avoid logging request headers/bodies.

`public/index.php` requires HTTPS, Basic auth and a same-site session. `public/submit.php` additionally requires POST JSON and a session CSRF token. The browser sees neither the CRM endpoint credential nor private receipt/capture contents. Customer UUIDs are not included in confirmation content.

## Submission and retry behavior

The QA page stores the draft and a `crypto.randomUUID()` submission ID in a separate local-storage key. It can **copy** the original website's `selectedProducts` cart when hosted on that origin, or accepts manual SKU/Request Qty rows on a separate origin. It never clears or edits the public cart. Customer name/email and Country / Market are required (country max 100 UTF-16 characters, company/brand max 200), Brand/WhatsApp are optional, WhatsApp stays text with `+` intact.

Before the first network request, it freezes and persists the payload. Network and CRM failures retain that payload, UUID, cart and customer data. Definitive local validation errors allow correction under the same UUID; timeouts retain the frozen payload because CRM may already have committed. Only a fully confirmed result allows “Start a new QA inquiry,” which creates a new UUID. There is no email deduplication or automatic ordinary success redirect.

PHP normalizes product name, image, parameters/specification, carton quantity, unit and reliable `cartonCbm` from the server's static catalogue by SKU. It does not execute catalogue JavaScript, consult Sanity, or accept browser-authoritative images/specifications. Images must be PNG/JPEG and resolve to `https://romiku.com/images/products-local/...`; unsupported formats such as WebP are rejected before saving rather than dropping the image; unknown SKU and invalid quantity fail validation. Client quantity and requirements remain the customer's inputs. Positive quantities allow up to 11 integer digits and four decimal places; larger magnitudes are rejected before floating-point conversion to avoid silently losing decimal precision. Product names must be nonempty and at most 500 UTF-16 characters; joined specifications must be at most 10,000. Present carton quantity/CBM must be finite, nonnegative and at most 100,000,000 / 1,000,000. Required values also reject Unicode-whitespace-only input. The exact encoded request body must fit the CRM 1 MiB limit. Invalid customer or catalogue values are rejected without truncation before the first submission state write or CRM request, with an editable `VALIDATION_ERROR` response. No price is collected or synthesized. Unknown packing keys are omitted; missing CBM remains blank downstream.

Under a per-submission file lock:

1. Persist the normalized first submission before contacting CRM.
2. POST to the allowlisted CRM endpoint using the server secret.
3. Validate and persist `{success,replay,id,document_number,submitted_at,normalizedSubmission}`. CRM replay's **original** normalized payload replaces any retry input for notification purposes.
4. Fetch the internal workbook using POST `/api/website-inquiry-xlsx`, same host/header, body `{id,submissionId}`. The CRM shared package-preserving renderer loads the original saved Inquiry; PHP never reimplements or modifies XLSX.
5. Capture/send the internal notification with that workbook and capture the concise customer notification without an attachment.
6. Record each successful notification independently. Retry skips the CRM call once its receipt is durable and skips each successful notification. A timeout before recording a CRM receipt reposts the same submission UUID, relying on CRM idempotency.

The internal message shows saved WI number/date, Name, Company, Brand, Email, WhatsApp, Market, Notes and SKU/Product/Specs–Notes/Request Qty/Carton Qty. The customer message shows name and SKU/Product/Qty, with no WI/CRM UUID, CBM, supplier, cost, internal notes, price or Excel. Both consume the CRM receipt's original normalized snapshot. Date comes from saved `submitted_at`, never notification generation time.

Capture mode writes deterministic private `UUID.internal.capture.json`, `UUID.customer.capture.json`, and `UUID.internal.xlsx` files. Replays do not replace already captured content. The browser explicitly says no emails were sent. Missing XLSX or internal-mail failure keeps that notification pending; a successful customer capture is not repeated.

## Explicit internal-mail acceptance

Capture mode needs no SMTP configuration and cannot send real mail. For the requested internal-email acceptance check, a hosting operator can configure `internal-only` and a private PHP mailer callback using the existing server's SMTP transport and secret storage. **Never include or execute the old `submit-rfq.php` handler**: it performs legacy business actions. No credentials are read during development/tests.

The private file returns `function (array $mail): bool`. The mail array includes `recipient` (always fixed to `info@romiku.com`), UTF-8 `subject`, escaped `html`, binary XLSX `attachment`, `attachmentName`, stable `messageId`, and `submissionId`. The adapter should use the existing server's authenticated SMTP connection and attach the provided bytes as `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`; it must not regenerate the workbook, fetch customer data, or modify recipients. Return `true` only after server acceptance; `false` only when definitely not accepted. Throw on an uncertain acceptance (for example, disconnected after SMTP DATA). Do not return or log server credentials. Customer confirmation is always captured even in this mode, including the test address `qa@example.com`.

A private delivery journal prevents automatic duplicate send after uncertain SMTP acceptance. An `attempting` journal needs operator reconciliation using the stable Message-ID: after confirming acceptance, mark it `accepted`; after confirming non-acceptance, mark it `unsent`, then retry the same submission. Do not delete a pending submission or allocate a new UUID to recover a notification. SMTP cannot offer exactly-once delivery across an acknowledgement loss; this mode deliberately requires reconciliation rather than guessing. A successful accepted journal is never resent.

## Tests

From this directory, with PHP 8.1+ installed:

```sh
npm test
```

Or with the isolated local PHP Docker runtime:

```sh
docker pull php:8.3-cli
ROMIKU_TEST_PHP=docker npm test
```

Docker test runs use `--network none`, read-only source mounts, temp-only state and injected fake CRM/attachment/mail transports. No Preview/live write or real email is made. Tests cover browser persistence/validation correction, authoritative products, optional WhatsApp/brand, CRM-first failure, original replay payload/date, internal failure retry, duplicate notification suppression, exact host rejection, private capture permissions, fixed internal recipient, attachment isolation and uncertain SMTP acceptance.

## Historical initial deployment checklist

The initial deployment required checking the actual Namecheap PHP version/extensions, private directory, server environment support, Basic auth/session routing, Preview API access and shared secret remain hosting checks. The private SMTP callback must be installed before the real internal email check. These are not satisfied by a passing capture test. After deployment, run the specified ABC Nails / `qa@example.com` / `+57 300 123 4567` / Colombia / SUN5 120 + G03 600 scenario; compare CRM quantities, captured internal HTML and XLSX F column; retry the same UUID; then use a new UUID with the same email. Only explicitly enabled internal-only QA may send to ROMIKU; never route automated tests or customer confirmations to real customers.

## Controlled two-recipient mail QA

`controlled-test` is an explicit, temporary extension of the capture workflow. It requires `ROMIKU_QA_INTERNAL_RECIPIENT`, `ROMIKU_QA_CUSTOMER_RECIPIENT`, `ROMIKU_QA_TEST_SUBMISSION_ID`, `ROMIKU_QA_TEST_EXPIRES_AT` (Unix seconds), and `ROMIKU_QA_MAILER_FILE`. Both addresses must be specified by the operator for this test. Dispatch replaces any payload recipient with the corresponding fixed address; it never sends to the customer's submitted address. Only the approved submission UUID can send, and an expired window fails closed. All other CRM destination restrictions remain unchanged.

Reuse the original submission UUID when its notifications are pending and definitively unsent. Never reset an existing captured/sent notification ledger to manufacture a send. The shared submission lock and separate internal/customer delivery journals prevent acknowledged messages from being repeated. Uncertain acceptance still requires reconciliation, including for customer confirmation. Accepted local MTA delivery is not proof of inbox receipt.

The verified hosted QA uses the existing website socket SMTP implementation, not PHP `mail()`/sendmail. The private adapter references `/home/romilnrk/public_html/api/config.php`; that loader reads the existing `smtp-secret.php` in the same directory. No credential is copied into QA code or packages. Only the eight transport/helper function declarations are extracted unchanged from the existing handler into a private PHP file; no handler top-level business logic is executed. `lib/smtp-reuse.php` adds a second fixed recipient/submission allowlist, builds MIME using the configured sender/Reply-To, and passes it to the existing `smtp_send_raw`. For this acceptance only, both recipients are `yf19961225@gmail.com` and the approved submission is `eb90d6ce-8f63-4f44-a805-969ebf15eac3` (WI-000226). A different destination or submission fails before transport. Customer confirmation has no attachment. Unknown SMTP acknowledgement remains blocked for operator reconciliation.

The Namecheap private bootstrap must allow the above configuration keys as well as the existing keys. Keep the hosted mode `capture` until the two recipients and private callback are configured and checks pass. After the single first-submit/retry exercise, restore `ROMIKU_QA_MAIL_MODE=capture` immediately, then verify both the stored configuration and HTTP notification mode. The expiry is an additional stop on delivery; it does not replace explicit restoration. Never use `controlled-test` for public website traffic.

## Hosted real-email acceptance (2026-10-07)

WI-000226 was resumed with its original submission UUID. Existing SMTP is Zoho `smtppro.zoho.com:465` over implicit TLS (`ssl`); username/sender/Reply-To `info@romiku.com`, sender name `ROMIKU NAILS`. The configuration and secret file remain unchanged in their original `public_html/api` location. Internal and customer messages were each accepted once and both verified in the designated Gmail inbox. The internal attachment downloaded from Gmail has SHA-256 `8d660a6d7fb7bc6fd476b5d979a059e0f712661f39caa856b366bd471c824508`, identical to the captured sent bytes. SUN5 Request Qty 120 (Carton Qty 24), G03 Request Qty 600 (Carton Qty 600) match the original saved CRM receipt. A changed-payload retry returned the same WI and did not call SMTP again. QA was immediately restored to capture and its HTTP response reconfirmed capture mode. Production, legacy CRM and the public submit flow were not changed.

## RC shared runtime packaging

QA lib/pipeline.php and lib/mail.php now load ../../website-runtime/lib. Any future QA package must preserve sibling website-qa and website-runtime directories, or deliberately expand the two shims during packaging. Do not overwrite the accepted hosted QA app with a partial directory copy. Production uses the separate allowlisted release/build-package.py; QA helpers are excluded. Hosted QA remains unchanged in capture mode.
