# Dependency Notes

Flowybooks is Apache-2.0 licensed. Third-party dependencies retain their own
licenses; review them before redistributing binaries or hosted services.

Useful checks:

```bash
bun audit
bun pm ls
```

Key runtime groups:

- Next.js, React, Tailwind CSS, and Radix UI for the web app.
- Better Auth, Kysely, Drizzle ORM, and PGlite for local Postgres-compatible
  auth/database access.
- AI SDK OpenAI-compatible provider support for local Ollama and optional
  OpenAI hosted/API mode.
- pdf-parse for local PDF text extraction.

No email-delivery, hosted telemetry, paid-plan, or payment-provider SDKs are
required by this repo.

`@better-auth/telemetry` may appear in the lockfile as a Better Auth transitive
dependency. Flowybooks explicitly disables Better Auth telemetry in its auth
configuration.
