# Phase 1A Quality Gate Addendum

This addendum updates only the test-result interpretation in the Phase 1A implementation plan. It does not change ROMIKU business requirements, data-model rules, scope, or task order.

## Required checks

For every Phase 1A task and for Phase 1A acceptance, run the applicable checks:

```bash
make test
make typecheck
make lint
make build
```

Run `make test-e2e` only after Docker Desktop and local Supabase are verified. Database-changing tasks additionally require:

```bash
npx supabase db diff --local
```

## Test acceptance rule

`make test` is accepted only when:

1. the fixed six failures in [Atomic Baseline Exception](./baseline-exception.md) remain exactly unchanged; and
2. no other test fails.

ROMIKU tests, Atomic tests outside that exception, typecheck, lint, build, migration checks, and applicable E2E tests must pass. A changed failure count, file, name, or reason is not covered by the exception and is a regression.
