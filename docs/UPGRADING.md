# Upgrading

Flowybooks is pre-1.0. Expect changes, but the project should preserve local
data compatibility whenever practical.

Before upgrading:

1. Stop the app.
2. Back up `PGLITE_DATA_DIR`.
3. Pull/install the new version.
4. Run `bun install`.
5. Run `bun run db:migrate`.
6. Run `bun run verify` if developing locally.

If a release requires manual steps, document them in the release notes before
publishing.
