# Preview atomic-save acceptance — in progress

Authorized migration remains byte-for-byte SHA-256 `187854b764ba5e24e29079c338d4f5a5ca30dfadd9a86c67300ce02ab98010a6`.

Fresh Preview catalog matches the previous approved capture exactly; Ledger 77; journal/executor absent. Actual SQL session postgres, SSL true, transaction read-only. Backup archive SHA-256 `a1640737a7b10b0ebaae9b6356dbe48f3c56a977cee3fbf9625215dc7ffd1e89` readable. November 4 backup excludes subsequent writes; no whole-database restore is permitted.

Two necessary frontend acceptance fixes:
- Recovery navigation uses the actual hash router and an explicit link; no automatic navigation or resubmission.
- `VITE_DOCUMENT_SAFE_ROLLBACK=1` is a separate build: document routes have disabled editing controls and save/source-conversion provider methods reject before requests. Reads remain enabled, persisted receipts and revisions stay in the database. Normal builds do not enable this mode. This is not a database authorization substitute.

Local recovery and rollback tests: 4 PASS. Full suite: 1511 PASS, 8 known harness failures, 3 existing skipped. Typecheck/lint/build/PWA and separate rollback build passed. Real Preview deployment/migration/rollback acceptance are pending; do not claim GO yet.

Evidence directory: `/Users/romiku/Documents/ChatGPT/ROMIKU CRM 2.0/document-atomic-preview-20261112/evidence`.
