# Architecture

Flowybooks is organized around a local-first bookkeeping core. The app should
stay easy to run, easy to audit, and safe to extend without SaaS or
hosted-service assumptions.

## Boundaries

- `lib/accounting/**` owns accounting rules: chart of accounts, journals,
  posting, audit-friendly lifecycle behavior, and reports. Code here should be
  testable without React.
- `lib/imports/statement-import/**` owns statement upload, parsing, AI extraction,
  reconciliation, categorization, and posting imported transactions to journals.
- `lib/kevin/**` owns Kevin, model routing, accounting skills, authority-source
  labels, memory/document search, and local/hosted AI boundaries.
- `lib/db/schema/**` owns the domain-split Drizzle schema, with
  `lib/db/schema/index.ts` as the compatibility barrel.
- `lib/db/queries/**` owns direct database reads and writes used by app routes,
  server actions, and services.
- `app/**` owns Next.js routes, pages, server actions, auth checks, form
  adapters, redirects, and cache revalidation.
- UI components should render and manage user interaction. They should not
  import Drizzle tables or reach directly into the database.

## Route Tree

Next.js route groups are used for layout organization only. They should not be
read as product URLs.

- `app/(site)/page.tsx` is the public home page at `/`.
- `app/(site)/dashboard/**` is the authenticated app surface at `/dashboard/**`.
- `app/(login)/**` owns authentication pages like `/sign-in` and `/sign-up`.
- `app/api/**` owns JSON and file-export endpoints.

Authenticated product pages should live under `app/(site)/dashboard/**`. Avoid
adding duplicate top-level app routes such as `/accounts`, `/journal`,
`/reports`, `/statement-imports`, or `/kevin`; use `/dashboard/**` links
instead.

## Server Workflow Shape

Server actions and API routes should follow the same shape:

1. Authenticate and authorize the current user/team.
2. Validate request input and ownership of referenced ids.
3. Call a domain service or query helper.
4. Revalidate affected pages or return a small JSON result.

If a route needs raw SQL, Drizzle tables, or multi-row query shaping, put that
logic in `lib/db/queries/**` or a domain service rather than inside `app/**`.

`bun run arch:check` enforces the most important UI boundary: React UI files
must not import Drizzle schema rows, Drizzle query helpers, or the database
client.

## Accounting Rules

Accounting code should prefer explicit invariants over comments:

- every journal line is org-scoped;
- posted reports only use posted journal batches;
- account ids must belong to the current org before writes;
- journal lifecycle changes should happen inside transactions;
- imported statement transactions should be idempotent where retries are likely;
- audit entries should be written for user-visible accounting state changes.

The accounting database and services are the product foundation. Kevin may
propose or draft, but deterministic accounting services enforce account
ownership, debit/credit balance, posting state, and audit behavior.

## Statement Import Rules

Statement imports support three paths:

- CSV/manual workflows that require no AI;
- optional local Ollama extraction/categorization;
- optional BYO hosted AI providers.

AI code must stay behind provider/key detection. When AI is enabled, statement
text and transaction descriptions should be redacted or minimized before leaving
the local app. Posting imported transactions to journals must remain a database
transaction.

## Kevin Rules

Kevin is allowed to help with basic bookkeeping workflows, but should not be
treated as a general advisory, tax research, GAAP research, or web-browsing
agent.

- Kevin memory, threads, documents, actions, and uploaded statement context must
  remain org-scoped.
- Kevin should ask follow-up questions when a journal entry is ambiguous.
- Kevin may propose or draft by default.
- Kevin may post only when the user clearly asks and the UI presents final
  confirmation.
- Kevin authority answers must pass through the source label gate. Tax answers
  require allowed IRS and Congress support. GAAP conclusions require FASB/ASC
  support when GAAP authority is needed.
- The authority fetcher is constrained to allowlisted official domains and
  cannot use cookies, credentials, arbitrary domains, local files, shell access,
  or POST/form submission.
- Time Machine restores are app-level deterministic snapshots, not inverse GL
  transactions and not Kevin-only undo.

## Test Layers

- `bun run test` runs fast unit tests only.
- `bun run test:integration` runs optional PGlite-backed bookkeeping tests.
- Integration tests should use synthetic data and rollback transactions.
- Do not add hosted access gates, marketing, hosted-email, hosted-payment, deploy-stage, or
  customer-data fixtures.

## Simplification Status

Completed cleanup:

- shared quote-aware CSV parser;
- shared API guard for high-risk routes;
- statement account/allocation ownership validation;
- audit logging when draft journals are posted;
- smaller statement transaction table modules;
- smaller journal form parser modules;
- smaller statement extraction helper modules;
- database query helpers moved out of statement-import actions;
- optional bookkeeping integration test harness;
- safer setup behavior around existing `.env` files;
- shared API guard coverage for org-scoped read and write routes;
- domain-split Drizzle schema modules;
- `lib/imports/**` and `lib/kevin/**` boundaries;
- architecture check for UI/database imports.
- dashboard route tree consolidated under `app/(site)/dashboard/**`.

Remaining worthwhile cleanup:

- split the login page into smaller form/panel components;
- move remaining direct route/server-action Drizzle shaping into repositories;
- keep carving `lib/kevin/service.ts` into smaller action services;
- add a lightweight UI smoke test for statement review once the demo data path
  is stable.
