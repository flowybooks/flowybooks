# Accounting Core

Flowybooks treats the accounting core as the product foundation. Kevin and AI
imports may propose work, but deterministic accounting services enforce the
rules before anything changes the books.

## Boundaries

- `lib/accounting/**` owns chart of accounts, journals, lifecycle operations,
  reports, audit records, and Time Machine snapshots.
- UI and API code should pass narrow inputs into accounting services instead of
  editing Drizzle rows directly.
- Journal writes must validate org ownership, balanced lines, valid dates, and
  allowed lifecycle transitions.
- Reports should read posted journal batches only and apply classification rules
  from the chart of accounts.

## Invariants

- Every account, journal batch, journal line, import row, and Kevin action is scoped to an organization.
- A posted journal must balance in integer cents.
- Drafts can be edited; posted journals are preserved through lifecycle entries
  instead of silent mutation.
- Voided journals do not affect reports.
- Report date filters use accounting dates, not browser-local date coercion.

## Extension Pattern

When adding accounting behavior:

1. Add or reuse a service in `lib/accounting/**`.
2. Keep validation close to the service entrypoint.
3. Add unit tests for pure rules.
4. Add PGlite integration tests for persistence and reporting behavior.
5. Keep route/server-action code as auth, validation, service call, response.
