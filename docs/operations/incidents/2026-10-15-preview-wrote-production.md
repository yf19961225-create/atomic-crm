# 2026-10-15 Preview QA accidentally wrote Production

Status: contained; Production data was touched. Do not use deployment
`dpl_Fj2LQo2LU3VZM9VQ2TsF91ybbbMv` for further write testing.

## Scope and observed state

- Production Supabase project: `vddjodsbmuarshnytyvb`; affected production
  order: `64a8d6f0-50d7-4029-954d-4c6b750e7f87`.
- Three successful QA saves set `factory_due_at` to October 25, then October
  30, then `NULL` in 2026. The current value is `NULL`, which matched the
  observed value before testing. This is **not** evidence of complete record
  restoration.
- The current header has status `scheduled`, unchanged status timestamp
  `2026-10-15 07:00:29.433881 UTC`, and no new status-history row during the
  QA window. Its `updated_at` is `2026-10-15 07:38:45.03454 UTC` and its
  `updated_by` is the QA account.
- The single current production item, ID
  `6621942f-3c9d-46f0-8020-d3879f7427f3`, has `updated_at`
  `2026-10-15 07:38:45.046517 UTC` and `updated_by` set to the QA account.
  Its current SKU is `RFG001`, position `1`, quantity `180`, carton count `1`,
  and quantity per carton `180`. Its barcode and production note are `NULL`.
- The current header document number is `mendy 8合1功能胶26.10.15`; name,
  supplier, anomaly notes, notes and factory due date are `NULL`. The current
  `marking_snapshot` hash is `08283a8020b516d87ee3293120db805b`.
- There are currently zero production followups and zero linked manual tasks.
  The save RPC contains no insert/delete for either table. The source Order's
  `updated_at` is `2026-10-15 05:23:48.843367 UTC`, before the QA window.
  The production numbering counter currently has value `10`; the capacity
  trigger executes a no-op update of that counter on each save.
- The save RPC updates the header and every existing item even when most
  business fields are unchanged. The audit triggers reset their `updated_at`
  and `updated_by`. No new production row or item row is present with a
  creation time in the QA window, and the RPC contains no item DELETE.

## Limits of evidence

No independent full pre-test snapshot or row-level before/after audit log has
been found. Therefore the current `marking_snapshot`, product and packaging
snapshots, other header fields, and item fields cannot be proven byte-for-byte
identical to their values before QA. No attempt will be made to invent old
values or rewrite `updated_at`. Business data net change must not be claimed
as zero. Production data touched: **YES**.

The Preview Supabase project `ciwaibtotispazfviims` has ledger `63` and the
Preview-only product packing fixture `SKU 006 = 24 / 50 / 40 / 35 / 12.5`.
The affected Production order ID is absent from that project.

## Root cause and containment

The QA deployment was a Vercel Preview deployment of source
`0059f84c5d22bddb634d52fa6ca7543dee75e561`, but the authenticated CRM
runtime accessed the Production Supabase project. This was discovered only
after the three saves. The exact origin of the wrong build-time target still
requires deployment-variable or bundle evidence; branch-specific Preview
variables exist for an older Git branch, while this local CLI deployment did
not use that branch. A new build-time guard now rejects Preview builds unless
both browser and server Supabase URLs target `ciwaibtotispazfviims`, and
rejects Production builds unless both target `vddjodsbmuarshnytyvb`.

The affected Preview deployment remains unsafe until superseded and should
never be used for additional QA writes. Production frontend remains
`d41d6a1101489df760aafc5871a8078221d053f4`; no Production frontend or
database recovery write is authorized by this incident response.
