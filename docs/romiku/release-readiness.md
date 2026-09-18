# Task10 local release evidence

Verified on 2026-09-18 using Node 22.23.2, Docker/local Supabase and Chromium,
on top of Task9 commit `956265f`. This records local readiness, not a production
deployment or hosted acceptance result.

| Gate | Observed result |
| --- | --- |
| Local migration replay | `supabase db reset --local` passed |
| SQL integration | `supabase test db`: 146 assertions across 3 files passed |
| Concurrency | `node --test supabase/tests/romiku_concurrency.mjs`: 3/3 passed |
| API and smoke guard | Opt-in server project against real local DB: 39/39 passed |
| Declarative drift | `supabase db diff --local`: no schema changes |
| Two-user Playwright smoke | 1 workflow passed, including real Auth/persistence and both UI logins/source links |
| Full suite | 684 tests: 676 passed, 2 skipped, exactly 6 accepted upstream harness failures |
| TypeScript | `make typecheck` passed, including new dedicated smoke/config type checking |
| Lint and formatting | `make lint` passed |
| Production build | `make build` passed |

The full-suite failures match the names and failure reasons in
[baseline-exception.md](baseline-exception.md): one preserved-worktree assertion,
three subsequent missing worktree-file errors, one session-cleanup assertion and
the idempotent setup exit-code assertion. No additional test failures were
accepted. The initial full-suite process stalled and was stopped; the same
`CI=1 make test` command completed on retry in 27.14 seconds. The opt-in real API
handler test runs separately so the default suite's skip is not mistaken for
integration coverage. The other skip is inherited from upstream.

The new local-target guard followed red/green: with the guard stubbed, the test
failed because a remote target was accepted; with the strict local destinations,
both guard tests passed. No product behavior or schema changed in Task10.
The first smoke run exposed a fixture-cleanup foreign key from `sales` to Auth;
cleanup was corrected to remove only the test users' sales rows before their Auth
accounts. The complete workflow then passed.

Existing nonblocking ESLint/circular-chunk/bundle-size warnings remain. The smoke
also reports its deliberate offline Sanity enrichment event and Playwright's
color-environment warning. Neither is evidence of live catalog verification.

See the [runbook coverage matrix](deployment-runbook.md#coverage-and-limits) for
which assertions run through browsers, real local APIs, SQL or unit tests.
No production credentials, private keys, customer data or local Auth passwords
are included in this report.

## Outstanding production work

Production release is blocked on confirmed new Supabase/Vercel targets and
access, DNS authority for `crm2.romiku.com`, two intended user identities,
server-only secrets, website PHP configuration/source for compatibility checking,
and explicit deployment authorization. Confirm the existing public Sanity catalog
and production-origin access. Configure/test Auth email if needed.

Hosted HTTPS, Vercel routing/runtime, production recovery, website-server cutover
and final business acceptance remain unexecuted. No remote writes, deploys, push,
DNS or website configuration changes were made. The existing attachments bucket
is public; confidential attachment handling is outside the verified workflow and
needs a separately verified private-file implementation before such use.
