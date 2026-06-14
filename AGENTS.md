# Flowybooks Agent Instructions

## Product Context

Flowybooks is local-first accounting/bookkeeping software. Treat accounting
correctness, organization isolation, money handling, imports, and AI-assisted
journal entry proposals as security-critical.

The open-source product includes bookkeeping, chart of accounts, journal
entries, reports, statement imports, local authentication, organization-based
access control, and Kevin, the AI-assisted accounting workflow.

## Core Invariants

- Never use JavaScript floating point for money.
- Use integer cents, fixed-point decimal, or the existing project-approved money representation.
- Read the existing schema, migrations, and tests before changing accounting logic.
- Preserve `org_id` scoping everywhere.
- Never weaken organization or tenant isolation.
- Never bypass authorization checks.
- Derive organization context from the authenticated session/current org on the server.
- AI-generated journal entries must remain proposals until explicitly approved by a user.
- Posted journal entries should not be silently mutated.
- Changes to journal posting, retained earnings, trial balance, balance sheet, income statement, or general ledger logic require tests.
- Changes to file imports require validation tests.
- Changes to auth, roles, invites, organization permissions, or local access control require authorization tests.
- Do not add production dependencies unless existing tools are insufficient.
- Do not reintroduce cloud-only billing, Stripe, hosted subscriptions, or deployment-stage assumptions.

## Required Checks

After TypeScript changes:

- Run `bun run typecheck`.
- Run `bun run test`.
- Run `bun run test:integration` when the touched behavior crosses database, auth, org, import, or accounting-service boundaries.

After UI, auth, import, or workflow changes:

- Run `bun run test:e2e` when relevant.

After database schema or migration changes:

- Explain the migration.
- Explain compatibility risks.
- Include or update tests.
- Run the repo's migration checks when applicable.

For release-sized changes:

- Run `bun run verify` unless the user explicitly scopes verification down.

## Preferred Workflow

For new features:

1. Read the existing implementation.
2. Write a short spec.
3. Write a test plan.
4. Implement the smallest safe version.
5. Run checks.
6. Summarize what changed and what remains.

For bugs:

1. Reproduce or identify the failing path.
2. Locate the smallest responsible unit.
3. Fix the bug.
4. Add a regression test.
5. Run checks.

For security-sensitive work:

1. Identify the authorization boundary.
2. Check `org_id` scoping.
3. Check input validation.
4. Check file handling if relevant.
5. Check whether AI output can affect persisted accounting records.

## AI Accounting Rules

- Kevin may draft, propose, explain, and ask follow-up questions.
- Kevin may not post or persist accounting records unless the user clearly asks to book, post, record, or save the entry.
- Model output must be validated with deterministic TypeScript/Zod checks before database writes.
- Accounting invariants belong in code, not prompts.
- Ambiguous entries should trigger missing-fact questions instead of guessed journal entries.
- Hosted AI providers may expose selected context to the configured provider; preserve the repo's privacy warnings and provider controls.

## Style

- Prefer simple, boring code.
- Avoid over-engineering.
- Avoid generic SaaS abstractions unless they solve an actual Flowybooks problem.
- Keep accounting logic explicit and testable.
- Keep local-first assumptions visible in code and docs.
- Ask before making broad architectural rewrites.
