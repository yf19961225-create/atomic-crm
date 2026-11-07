# Design System 2.0 integration

Base: e37b45b2534faaa0774345953e2b44875ef3ef08. Source: preserved 6359be15 (and its pilot ancestors); never merge mixed candidate. Preview only.

1. Recover reviewed visual wrappers, scoped tokens and local fonts. Preserve current toolbar, date components and Shanghai day helper byte-for-byte.
2. Exclude six extra routes and order edit-readiness behavior. Existing missing route access and pre-load editing remain separately documented risks, not PASS.
3. Run frontend suite, typecheck, lint, Preview build and PWA check; review full branch diff.
4. Commit and sync isolated branch respecting approval. Deploy existing Vercel project with Preview-only target.
5. Browser audit all 15 modules and actual page types, 1440/1280/390; QA-only writes. Capture fresh evidence.
6. Report per-page coverage and limitations; no Production deployment.

Rulings: preserve old branch and evidence; reuse tested code instead of reimplementing. Local unicode-range Noto font assets are excluded from eager PWA precache as in approved original design, downloaded on demand. Settings remains an existing placeholder, not a newly implemented module.
