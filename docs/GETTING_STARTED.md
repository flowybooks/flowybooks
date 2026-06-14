# Getting Started

This guide runs Flowybooks on your machine with Bun and local PGlite Postgres.
You do not need a hosted database, a hosted auth provider, email delivery,
payment provider, or an AI provider account.

## 1. Install Requirements

- Bun 1.1+
- Node.js 20.9+ as the underlying Next.js runtime compatibility target

Use Bun for the documented local development path.

## 2. Install Dependencies

```bash
bun install
```

## 3. Create Local Configuration

Run the setup wizard:

```bash
bun run db:setup
```

Choose the default PGlite data directory when prompted, or enter another local
filesystem path. This is the durable database location for your books, not a
temporary in-memory store. The default local database directory is:

```env
PGLITE_DATA_DIR=.pglite/flowybooks
```

The setup wizard also writes unique local secrets for auth and the cleanup cron
endpoint. If `.env` already exists, the wizard leaves it alone unless you
explicitly confirm an overwrite. Overwrites create a timestamped backup first.
For scripted setup, use `bun run db:setup -- --force` or set
`FLOWYBOOKS_SETUP_OVERWRITE_ENV=1` only when replacing `.env` is intentional.

You can also copy `.env.example` to `.env` and replace `PGLITE_DATA_DIR` with
your preferred local database directory. Do not use `:memory:`, `memory://...`,
or URL-style targets for accounting data; Flowybooks rejects those values so
journal entries and reports survive server restarts.

### Container Persistence

If you open Flowybooks in a container, durable storage requires an explicit
persistent volume. Without a mounted volume, PGlite data may be written inside
the container filesystem and can be lost when the container is removed, rebuilt,
or replaced.

For container use, set:

```env
PGLITE_DATA_DIR=/data/flowybooks
```

Then mount `/data` as a Docker volume or host bind mount. Back up that mounted
volume, and run only one Flowybooks container against the same PGlite data
directory at a time.

## 4. Configure AI, Or Leave It Off

AI is optional. CSV statement imports, manual categorization, journal entries,
and reports all work without AI.

For local AI with no external account:

```bash
ollama pull gemma4:26b-mlx
```

Then set:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=gemma4:26b-mlx
KEVIN_OLLAMA_SMALL_MODEL=gemma4:26b-mlx
KEVIN_OLLAMA_MEDIUM_MODEL=gemma4:26b-mlx
KEVIN_OLLAMA_LARGE_MODEL=gemma4:26b-mlx
```

`gemma4:26b-mlx` is the default local Ollama model. Local models keep data on
the operator's machine, but performance depends heavily on local hardware.
Hosted OpenAI is still better for faster testing and reasoning-heavy Kevin
workflows.

For hosted/API mode, set `AI_PROVIDER=openai`, provide `OPENAI_API_KEY`, and
review the Kevin page's hosted privacy warning before sending ledger context to
OpenAI.

Kevin is experimental. He can help with basic bookkeeping questions, statement
uploads, document Q&A, and simple journal-entry proposals, but he is not a
substitute for professional review. Tax and GAAP-style answers are source-gated.
If Kevin cannot ground the answer in allowed official sources, Flowybooks should
label it as educational or blocked instead of authoritative.

## 5. Run Migrations

```bash
bun run db:migrate
```

## 6. Start The App

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and
create your first organization.

## 7. First Bookkeeping Steps

1. Go to **Chart of Accounts**.
2. Click **Apply Standard CoA**.
3. Mark the bank/cash account as **Statement**.
4. Mark the credit card payable account as **Statement**.
5. Go to **Bank Import** to upload bank or credit card CSV statements.
6. Go to **Journal** to book manual entries.
7. Go to **Reports** to run the balance sheet and income statement.

## Useful Commands

```bash
bun run test
bun run test:integration
bun run format
bun run lint
bun run typecheck
bun run build
bun run verify
bun run release:scan
bun run release:check
bun run ai:smoke:ollama -- --model gemma4:26b-mlx
bun run ai:eval:ollama-models
bun run db:studio
```
