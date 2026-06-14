# PGlite Backups

Flowybooks stores local books in the directory configured by `PGLITE_DATA_DIR`.
With the default setup, that is:

```env
PGLITE_DATA_DIR=.pglite/flowybooks
```

Back up that directory like accounting books. Include exported reports,
workpapers, and uploaded source documents when those matter to your records.

## Practical Guidance

- Stop the app before copying the PGlite directory.
- Keep only one app process attached to a PGlite directory at a time.
- Store backups somewhere outside the repo checkout.
- Test restoring a backup before relying on it.
- Do not use `:memory:`, `memory://...`, or URL-style database locations.
