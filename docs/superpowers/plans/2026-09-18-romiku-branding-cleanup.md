# ROMIKU CRM 2.0 Branding Cleanup

## Context

The deployed Today MVP is functionally stable but still exposes Atomic CRM
branding and English interface text in the login and static application shell.

## Global constraints

- Work only on `codex/branding-cleanup`; do not merge, push, or deploy.
- Do not change database schema, Supabase migrations, RLS, API behavior,
  business logic, resources, or permissions.
- Preserve the supplied ROMIKU logo wordmark without redesigning it.
- Keep ROMIKU customizations outside Atomic CRM upstream source where an
  extension point already exists.
- Preserve the fixed Atomic upstream test exception: no new test failures.

## Task 1: Chinese product shell and official ROMIKU brand assets

Create ROMIKU-owned branding and Chinese i18n adapters, pass them through the
existing `CRM` extension props, and replace static application-shell metadata.
Use the supplied official wordmark for login and layout branding; derive
favicon/PWA imagery without altering the original wordmark. Translate all
runtime CRM user-facing UI copy to Simplified Chinese, including auth,
navigation, generic CRUD controls, ROMIKU modules, validation/notification
messages, and the Atomic extension screens that remain enabled. Do not modify
schema or business behavior. Add regression tests that first demonstrate the
pre-change Atomic/English branding and then verify the ROMIKU Chinese shell.

## Acceptance checks

- Login and auth-callback pages identify the product as ROMIKU CRM 2.0 and use
  the official ROMIKU logo.
- Page title, manifest and favicon/PWA images are ROMIKU-branded.
- The default runtime locale is Simplified Chinese, independent of browser
  locale, with no enabled CRM UI copy intentionally left in English.
- Existing user authentication, routes, resources and RLS behavior stay
  unchanged.
- Targeted branding/i18n tests, typecheck, lint, build, and the approved full
  test gate pass with no failures beyond the six fixed Atomic harness failures.

## Task 2: Translate commercial-document and fulfillment screens

Translate every runtime user-facing string in Quote, PI, Order, Payments,
Production, Packing/Shipping, Suppliers and Product/Sanity extension screens.
Preserve internal status codes, database field names and data values; translate
only presentation copy, accessibility labels and notifications. Add focused
Chinese rendering regressions.

## Task 3: Translate relationship, intake and calendar screens

Translate every runtime user-facing string in Website Inquiry, Outbound,
Formal Customer, Workbench and Calendar/manual-task screens. Preserve the
existing resource URLs, API payloads and data logic. Add focused Chinese
rendering regressions.
