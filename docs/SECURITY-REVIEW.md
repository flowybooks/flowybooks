# Security Review

This is the public-release security review for Flowybooks. It is a targeted
open-source readiness check, not a formal penetration test.

## Summary

No known critical or high-severity blockers were found for local-first
self-hosted use in the current working tree. Flowybooks is designed to run with
local PGlite, local auth, no payment provider, no email delivery provider, no
telemetry, and AI disabled by default.

## Release Posture

- **Database:** Local PGlite is the default runtime database for self-hosted use.
- **Auth:** Better Auth runs inside the app. There is no hosted auth service.
- **AI:** Optional. CSV/manual workflows work without AI. Local Ollama can be
  used without an external AI account. Hosted BYO AI keys are optional. Kevin is
  an early bookkeeping assistant, not a full advisory or research system.
- **Payments and email:** No payment provider, paid-plan gates, hosted email
  delivery, or outsourced service workflows are included.
- **Data ownership:** Application data, statement text, exports, and backups
  live wherever the operator configures the PGlite data directory and local storage.

## Findings And Notes

### SR-1: API route authorization is endpoint-level

API routes are intentionally excluded from the app route proxy/middleware and
must protect themselves at the route level. Existing sensitive routes use user,
organization, or role checks, and high-risk mutation routes now share the API role guard
in `lib/auth/api.ts`. Future route handlers should use the same pattern before
reading or mutating organization data.

Impact: a future API route could expose data if it is added without an auth/organization
guard.

Mitigation: review every new `app/api/**/route.ts` file for `withApiTeamRole`,
`getUser`, `getTeamForUser`, or `requireTeamRole`, and ensure queries are scoped
to the current organization.

### SR-2: Built-in rate limits are single-instance only

The built-in rate limiters use in-memory state. This is acceptable for local
single-instance self-hosting, but not enough for multi-instance cloud hosting or
serverless deployments.

Impact: an attacker could bypass limits by hitting different instances.

Mitigation: use a reverse proxy, platform firewall, or distributed rate limiter
for public or multi-instance deployments.

### SR-3: AI sends selected bookkeeping data to the configured provider

When AI is enabled, Flowybooks sends the minimum statement text, transaction
fields, amounts, dates, and chart-of-accounts labels needed for extraction or
categorization. High-risk PII redaction runs before AI categorization paths.

Impact: hosted AI providers may process accounting data according to their own
terms and retention policies.

Mitigation: keep AI disabled, use local Ollama, or choose a hosted provider you
trust. Do not upload real data to demo databases.

### SR-4: Kevin authority answers are source-gated but limited

Kevin has an allowlisted authority fetcher for official tax, GAAP, public-company
accounting, audit, and licensure sources. The fetcher is not a general browser:
it performs constrained GET requests only, omits credentials, revalidates
redirects, caps page size, rate-limits hosts, and treats fetched text as
untrusted evidence.

Impact: users may over-trust a model answer if the UI copy sounds authoritative.

Mitigation: keep answer labels visible, require IRS and Congress support for tax
answers, require FASB/ASC support for GAAP conclusions where needed, and treat
`cannot_answer_from_allowlist` as a blocker for authoritative conclusions.

### SR-5: Dependency audit is part of the release gate

Run `bun audit` before release. As of June 12, 2026, after the public-release
tooling refresh, `bun audit` reports no known vulnerabilities. Treat new runtime
advisories as release blockers.

Mitigation: upgrade tooling dependencies when compatible updates are available.

## Open-Source Hygiene Notes

- The Apache-2.0 software license does not grant rights to use the Flowybooks
  name or marks. Keep `TRADEMARKS.md` with public releases.
- `.env`, `.pglite/`, `.next/`, `node_modules/`, generated videos, private docs,
  logs, dumps, exports, and real customer/financial files should remain ignored.
- Placeholder domains such as `example.com` may appear in tests and UI examples;
  do not add real personal emails, customer names, bank names, account numbers,
  or statement data.
- Avoid public issue templates that ask users to upload real statements,
  screenshots with financial data, or secrets.
- Do not add hosted subscription gates, billing admin, payment SDKs, hosted
  telemetry, deployment-stage docs, or cloud-only assumptions to this repo.

## Final Scrub Checklist

Before publishing a fork or release artifact:

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run test:coverage:core
bun run test:deadcode
bun run build
bun run test:e2e
bun audit
bun run migration:check
bun run release:scan
bun run release:check
```

Search the working tree and reachable git history for:

- legacy private brand terms outside protective trademark and ignore files;
- old local machine paths;
- paid-plan, payment-provider, email-delivery, deployment-stage, cloud-only, and
  private-ops references;
- database URLs and API-key-shaped strings;
- private keys;
- tracked PDFs, dumps, images, logs, exports, and local database files.

Keep `.env`, generated videos, private docs, statement files, database dumps,
and local artifacts out of git.
