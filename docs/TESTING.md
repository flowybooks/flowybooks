# Testing Guide

Use the smallest test layer that proves the behavior.

## Commands

```bash
bun run test
bun run test:integration
bun run test:coverage:core
bun run test:deadcode
bun run test:e2e
bun run verify
```

## Structure

- `test/accounting/**`: accounting rules and PGlite-backed bookkeeping behavior.
- `test/imports/**`: statement import parsing, classification, normalization,
  and posting behavior.
- `test/kevin/**`: Kevin schemas, model routing, source labels, and action
  flows.
- `test/api/**`: authorization and org-isolation behavior.
- `test/db/**`: PGlite persistence and database-specific invariants.
- `test/e2e/**`: browser smoke tests for the local app happy path.

Prefer shared factories from `test/factories/**` for users, orgs, accounts,
journals, and imports.

`bun run verify` is the pull-request gate. `bun run release:check` adds the
dependency audit, migration check, and release scan for release work.
