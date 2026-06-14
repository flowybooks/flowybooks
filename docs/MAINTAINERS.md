# Maintainers

Flowybooks is company-backed open source. Maintainers should keep the local
accounting core reliable, auditable, and easy to run.

## Review Priorities

- Accounting correctness.
- Org isolation and authorization.
- Local data safety.
- AI privacy and source-gating.
- Test coverage for changed invariants.
- Public repo hygiene.

## Release Expectations

Before a public release:

```bash
bun run release:check
bun audit
```

Review README, CONTRIBUTING, SECURITY, TRADEMARKS, ROADMAP, and release notes.
Do not publish private docs, local data, logs, generated videos, `.env`, PGlite
data, or old cloud/billing residue.

## Walkthrough Recording

The repo includes a maintainer-only Playwright recorder for producing a
synthetic local UI walkthrough:

```bash
bun run record:walkthrough
```

See [Walkthrough Recording](WALKTHROUGH_RECORDING.md). Generated videos and demo
CSV files are local artifacts and must stay out of git.
