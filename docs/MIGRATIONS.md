# Migrations

Flowybooks uses Drizzle migrations against local PGlite.

## Rules

- Generate migrations with `bun run db:generate`.
- Review generated SQL before committing.
- Do not edit old migrations after release.
- Keep migrations compatible with a fresh local database and an existing local
  database.
- Do not require users to manually create `.pglite/`; the config creates the
  local directory before migration.

## Verification

Run:

```bash
bun run db:migrate
bun run test:integration
```

For release work, also run:

```bash
bun run migration:check
bun run release:check
```
