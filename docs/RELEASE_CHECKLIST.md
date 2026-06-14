# Release Checklist

Run:

```bash
git diff --check
bun run release:check
gitleaks detect --source . --redact --log-opts='--all'
```

Manual checks:

- README matches current setup.
- Kevin is described as experimental.
- No billing, Stripe, SaaS gate, private cloud docs, or real personal emails.
- Trademark language names Flowybooks, Inc.
- `.env`, `.pglite`, `.next`, `node_modules`, logs, dumps, and generated media
  are untracked.
- Browser E2E, focused coverage, dead-code checks, dependency audit, migration
  check, and release scan are part of the release gate.
- GitHub repo remains private until final approval to publish.
