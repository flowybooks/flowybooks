# Flowybooks

[![CI](https://github.com/flowybooks/flowybooks/actions/workflows/ci.yml/badge.svg)](https://github.com/flowybooks/flowybooks/actions/workflows/ci.yml)

Flowybooks is a local-first bookkeeping app built with Next.js, Better Auth,
Drizzle ORM, and embedded PGlite Postgres. Its strongest foundation is a
functioning accounting database with hard accounting rules: organization-scoped
books, chart of accounts, balanced journal entries, statement imports, and core
financial reports.

No cloud signup is required for normal use. The default setup runs the app and
PGlite locally, and AI is off unless you choose to configure it.

## Features

- Better Auth email/password login with organization membership.
- Chart of accounts CRUD and CSV import/export.
- Standard chart of accounts setup.
- Journal entry drafting, posting, voiding, adjustments, and CSV import.
- Balance sheet, income statement, trial balance, and general ledger reports.
- CSV statement import workflows for bank and credit card statements.
- Kevin, an early local accounting assistant that can handle basic Q&A, simple
  journal-entry proposals, document uploads, and source-gated labels. Kevin
  needs a lot of work before it should be treated as an advisory or research
  system.
- Deterministic Time Machine checkpoints for app-level workspace restore.
- Optional PDF extraction and AI categorization with local Ollama or OpenAI.
- Postgres schema and migrations managed by Drizzle against local PGlite.

## Requirements

Flowybooks is Bun-first for local development:

- Bun 1.1+
- Node.js 20.9+ as the underlying Next.js runtime compatibility target

## Quick Start

```bash
bun install
bun run db:setup
bun run db:migrate
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

The setup wizard can write a `.env` file that points at a local PGlite data
directory:

```env
PGLITE_DATA_DIR=.pglite/flowybooks
```

You can also copy `.env.example` to `.env` and change `PGLITE_DATA_DIR` if you
want the local database directory somewhere else.

### Container Persistence

If you run Flowybooks in a container, configure `PGLITE_DATA_DIR` to a mounted
persistent volume. The default `.pglite/flowybooks` path is durable for a normal
local repo checkout, but inside a container it may live on the container
filesystem and can be lost when the container is removed, rebuilt, or replaced.

For container use, prefer a mounted data path:

```env
PGLITE_DATA_DIR=/data/flowybooks
```

Mount `/data` as a Docker volume or host bind mount, and back up that volume.
Do not rely on an unmounted container filesystem for real accounting books. Run
only one Flowybooks container against a PGlite data directory at a time.

## Docs

- [Getting Started](docs/GETTING_STARTED.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Accounting Core](docs/ACCOUNTING_CORE.md)
- [User Guide](docs/USER_GUIDE.md)
- [Kevin](docs/KEVIN.md)
- [Adding Kevin Skills](docs/KEVIN_SKILLS.md)
- [Adding Reports](docs/ADDING_REPORTS.md)
- [Adding Statement Parsers](docs/STATEMENT_PARSERS.md)
- [Testing Guide](docs/TESTING.md)
- [Migrations](docs/MIGRATIONS.md)
- [PGlite Backups](docs/PGLITE_BACKUPS.md)
- [Upgrading](docs/UPGRADING.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Maintainers](docs/MAINTAINERS.md)
- [Project Direction](ROADMAP.md)
- [Security Review](docs/SECURITY-REVIEW.md)
- [Dependency Notes](docs/DEPENDENCIES.md)
- [Security Policy](SECURITY.md)
- [Trademarks](TRADEMARKS.md)

## AI Configuration

CSV imports and manual categorization work without AI. PDF extraction and
AI-assisted categorization are disabled unless `AI_PROVIDER` is configured.

For local AI with no external AI account, run Ollama locally and configure:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=gemma4:26b-mlx
```

The default local Ollama model is `gemma4:26b-mlx`. Local models keep data on
the operator's machine, but performance depends heavily on local hardware.
Hosted OpenAI is still the better path for faster testing and reasoning-heavy
Kevin workflows.

For hosted/API mode, set `AI_PROVIDER=openai` and provide `OPENAI_API_KEY`.
Kevin defaults to `gpt-5-nano`, `gpt-5-mini`, and `gpt-5.5` across the
small/medium/large tiers.

When AI is enabled, Flowybooks sends the redacted statement text, transaction
descriptions, amounts, dates, and chart-of-accounts labels needed for extraction
or categorization to the selected provider. Raw uploaded files are not sent
directly by Flowybooks; PDF text is extracted locally first.

Kevin's authority fetcher is intentionally constrained. It is not a general web
browser and it does not make Kevin an accountant, tax adviser, auditor, or legal
adviser. Tax and GAAP answers are source-gated; if Kevin cannot cite allowed
official sources, the UI should treat the answer as educational or blocked.

## Known Limitations

- Kevin is experimental. He is useful for basic bookkeeping drafts, document
  Q&A, simple journal-entry proposals, and source-gated labels, but he is not
  reliable for professional judgment, advisory work, complex tax/GAAP research,
  or messy import workflows.
- Flowybooks has no bank feeds or live bank integrations. Financial data enters
  through manual entry, journal entries, and PDF/CSV uploads.
- PGlite is a local embedded database. Use one running app process against a
  PGlite data directory at a time, and back up that directory like accounting
  books.
- Built-in rate limits are in-memory and intended for local single-instance
  self-hosting. Public or multi-instance deployments need an external proxy,
  firewall, or distributed rate limiter.
- Hosted AI is optional and BYO key. If enabled, selected redacted accounting
  context may be sent to the configured provider.

## Data And Privacy

Flowybooks stores application data in your configured PGlite data directory on
disk, not in process memory. With the default `PGLITE_DATA_DIR=.pglite/flowybooks`,
journal entries, chart-of-accounts data, imports, users, and reports survive
stopping and restarting `bun run dev`.

Do not set `PGLITE_DATA_DIR` to `:memory:`, `memory://...`, or any URL-style
database target. The app rejects those values because an accountant's books need
a durable local filesystem database. Back up the configured PGlite directory
alongside any exported workpapers and source documents.

Uploaded PDF source text is stored so extraction can be retried and reviewed;
use `CRON_SECRET` with the cleanup route if you want to purge stored source text
on a schedule. The app does not include hosted telemetry, email delivery, paid
plan gates, or payment integrations.

You are responsible for securing your database directory, `.env` file, backups, logs,
exports, and any AI provider account or local AI runtime you connect.

For public or multi-instance deployments, use a reverse proxy, platform
firewall, or distributed rate limiter in front of the app. Flowybooks'
built-in rate limiters are in-memory and intended for single-instance local
self-hosting.

## Useful Commands

```bash
bun run lint
bun run typecheck
bun run test
bun run test:integration
bun run build
bun run verify
bun run release:scan
bun run release:check
bun run db:generate
bun run db:migrate
bun run db:studio
```

## License

Apache-2.0. See [LICENSE](LICENSE).

Trademark rights are not included in the software license. See
[TRADEMARKS.md](TRADEMARKS.md).
