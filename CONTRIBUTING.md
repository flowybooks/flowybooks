# Contributing

Thanks for helping improve Flowybooks.

## Development

```bash
bun install
cp .env.example .env
bun run db:migrate
bun run dev
```

Before opening a pull request, run:

```bash
bun run verify
```

Run the dependency audit before releases and for dependency/security-sensitive
changes:

```bash
bun audit
```

`bun run verify` includes formatting, architecture checks, linting, typechecking,
unit tests, integration tests, focused core coverage, dead-code checks, a
production build, and the browser smoke test. Integration tests are required for
accounting, auth, import, Kevin, migration, or organization-scope changes.

## Guidelines

- Keep the app local-first and bookkeeping-focused.
- Do not add hosted telemetry, payment processors, marketing pages, or managed
  service workflows.
- Keep AI optional and off by default. Local Ollama support is allowed; hosted
  providers must remain BYO key.
- Document any data that leaves the local machine.
- Protect every non-public API route or server action with `withApiTeamRole()`,
  `requireUser()`, or `requireTeamRole()` at the endpoint.
- Keep UI/client components away from Drizzle schema rows and database clients.
  Use narrow UI or domain types instead.
- Keep unit tests in `test/` or next to the implementation as `*.test.ts`, and
  use only synthetic financial/customer data in fixtures.
- Keep integration tests as `*.integration.test.ts`; they must use synthetic
  data and rollback transactions.
- Add focused tests for accounting behavior, migrations, import parsing, and
  auth/permission changes.
- Avoid committing fixtures with real financial, personal, or customer data.
