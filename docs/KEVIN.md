# Kevin Local Accounting Agent

Kevin is Flowybooks' local-first accounting assistant. Today he can answer
basic ledger questions, search indexed org-scoped documents, remember compact
workspace facts, classify uploaded statements, propose simple journal entries,
draft journals, and post only after explicit confirmation. AI remains optional
and disabled until `AI_PROVIDER` is configured.

Kevin is early experimental software, not an accountant, tax adviser, auditor,
attorney, or complete research system. Advisory answers and source lookups are
deliberately source-gated. If the app cannot ground a tax or GAAP conclusion in
allowed official sources, Kevin should label the answer as educational or
blocked rather than presenting it as authority-backed advice.

## What Kevin Does Well Today

- Basic bookkeeping Q&A over the current organization.
- Simple debit/credit journal-entry proposals.
- Draft journal creation with server-side account resolution and balance checks.
- Bank and credit card statement upload classification.
- Deterministic chart-of-accounts actions when explicitly requested.
- Time Machine checkpoints before Kevin writes bookkeeping data.

## Current Limits

- Kevin does not replace professional review.
- Kevin does not browse the open web.
- Kevin does not automatically research arbitrary sources.
- Kevin can miss context in long, messy, or ambiguous documents.
- Kevin is not yet reliable for complex statement workflows, advisory work,
  professional judgment, tax research, or GAAP research.
- Kevin should ask follow-up questions before ambiguous journal entries.
- Kevin cannot post journals silently; the UI must show final confirmation.
- Tax conclusions require allowed IRS and Congress support. GAAP conclusions
  require allowed FASB/ASC support when GAAP authority is needed.

## Provider Selection

Environment variables are the v1 control plane. The dashboard shows the resolved
provider and model tier, but Flowybooks does not store hosted API keys in the UI.

Local Ollama:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=gemma4:26b-mlx
KEVIN_OLLAMA_SMALL_MODEL=gemma4:26b-mlx
KEVIN_OLLAMA_MEDIUM_MODEL=gemma4:26b-mlx
KEVIN_OLLAMA_LARGE_MODEL=gemma4:26b-mlx
```

OpenAI hosted mode:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=
KEVIN_OPENAI_SMALL_MODEL=gpt-5-nano
KEVIN_OPENAI_MEDIUM_MODEL=gpt-5-mini
KEVIN_OPENAI_LARGE_MODEL=gpt-5.5
```

The Kevin page displays labels such as `Local: gemma4:26b-mlx` or
`OpenAI: gpt-5.5`. Hosted mode also displays a privacy warning because selected
ledger, memory, document, and authority context may be sent to the configured
provider. The page also includes a `small` / `medium` / `large` selector so a
local user can keep routine work on the faster model and switch tiers only when
needed.

For OpenAI hosted/API mode, Kevin sends extra-high reasoning effort on large
tier calls.

## Model Tiers

- `small`: transaction classification, vendor normalization, memo cleanup,
  account suggestions, and simple JSON extraction.
- `medium`: journal proposals, reconciliation explanations, Q&A over known
  ledger data, and user-facing Kevin answers.
- `large`: higher-effort drafting and review for messy statements, longer
  document context, multi-step bookkeeping questions, and exception review.

For local Ollama, Flowybooks defaults to `gemma4:26b-mlx`. The small, medium,
and large Kevin tiers all resolve to this same local model unless you override
them with `KEVIN_OLLAMA_*_MODEL` environment variables. The older generic
`KEVIN_SMALL_MODEL`, `KEVIN_MEDIUM_MODEL`, and `KEVIN_LARGE_MODEL` names remain
Ollama compatibility aliases only, so stale local model names do not leak into
OpenAI routing when you switch providers.

Local Ollama keeps model traffic on the operator's machine, but throughput and
context handling depend heavily on the selected model and hardware. Hosted
OpenAI remains the better path for faster testing, long document work, and
reasoning-heavy accounting workflows.

## Kevin Statement Uploads

Kevin uploads do not ask the user to choose bank versus credit card. Kevin first
classifies the document as `bank_statement` or `credit_card_statement`, records
the confidence, evidence, and account-linking result under
`sourceInfo.classification`, and only auto-links when the match is high
confidence and unambiguous.

If a user uploads a file without written instructions, Kevin stores and
classifies the file, then asks what the user wants done next. He does not
extract, categorize, generate entries, or post from a silent upload. If the user
asks to extract or categorize, Kevin applies the detected methodology unless the
classification is low-confidence, ambiguous, or conflicts with the linked
account. Posted journals still require an explicit final confirmation button.

## Authority Fetching

Kevin has a constrained authority fetcher, not a general browser. It only makes
HTTPS GET requests to allowlisted domains, omits credentials/cookies, rejects
unsupported content types and file extensions, revalidates redirects, enforces a
page-size cap, limits per-question pages, rate-limits by host, and attempts to
respect `robots.txt`.

Configure a clear user agent:

```env
FLOWYBOOKS_USER_AGENT=flowybooks-local/0.1 (+https://yourdomain.example/bot)
```

Allowed source tiers are defined in `lib/kevin/source-tiers.ts`. Arbitrary web
domains are intentionally excluded. Fetched page text is treated as untrusted
evidence and cannot override schemas, source gates, tool permissions, or journal
invariants.

Every Kevin answer includes an answer label:

```json
{
  "answer_type": "tax | gaap | cpa_exam | bookkeeping | advisory",
  "authority_level": "primary | official_guidance | professional_guidance | educational",
  "sources_used": [],
  "cannot_answer_from_allowlist": false
}
```

Tax conclusions require allowed IRS, Treasury, Code, regulation, Federal
Register, Congress, or Tax Court authority, and Flowybooks policy requires IRS
and Congress sources as the primary citations for tax answers. GAAP conclusions
require allowed FASB/ASC support when GAAP authority is needed, and SEC/PCAOB
sources when the issue is public-company accounting or audit related. CPA
exam/licensure answers may cite AICPA or NASBA. Bookkeeping workflow answers may
use internal Flowybooks rules plus GAAP support when needed.

The model's built-in knowledge is not enough to create an authority-backed tax
or GAAP conclusion. The source label is produced by Flowybooks after checking the
allowed-source evidence returned to Kevin.

## Memory And Documents

Kevin stores org-scoped threads, messages, memories, actions, documents, and
document chunks in the local database. Memories are compact facts that Kevin can
reuse later, such as a recurring vendor rule or an org-specific accounting
preference.

Kevin searches app-uploaded statement text and parsed CSV statement
transactions automatically. To index a local folder, set an explicit root and
org id:

```env
LOCAL_AGENT_FILES_DIR=/absolute/path/to/kevin-docs
KEVIN_INDEX_ORG_ID=1
```

Then run:

```bash
bun run kevin:index:local
```

The indexer supports `.txt`, `.md`, `.csv`, and `.json` files, skips symlinks,
blocks traversal outside the configured root, caps file size, and stores chunks
in the database. Kevin never receives shell access or arbitrary local filesystem
access.

## Journals, Undo, And Redo

Kevin proposes or drafts by default. Posted journals require an explicit final
confirmation button even when the user asks Kevin to book, post, or record an
entry. Journal proposals are validated with Zod, account codes are resolved
server-side to org-owned accounts, inactive or unknown accounts are rejected,
and existing journal services enforce balanced debits and credits.

Kevin can also apply the bundled standard chart of accounts when the user
explicitly asks, for example:

```text
Apply the standard chart of accounts to this workspace.
```

This uses the same protected chart-of-accounts import planner as the Accounts
page. Kevin records an auditable `apply_standard_coa` action and captures a
Time Machine checkpoint before writing account rows.

Kevin can also add specific accounts when the user explicitly asks him to add or
create accounts. For these requests, Kevin gets room to infer reasonable account
details from the current chart and conversation context, then the server
validates every proposed name, type, classification, and code before writing.
Duplicate names are skipped, code collisions are reassigned within the account
type range, and protected system account names are rejected.

Example:

```text
Add Sales Tax Payable, Coffee Bean Expense, and Packaging Expense.
```

Before Kevin mutates chart-of-accounts or journal data, Flowybooks creates a
Time Machine checkpoint. The app-level restore UI is `/dashboard/time-machine`.
Restores are database-state restores, not inverse journal entries: the selected
checkpoint replaces org-scoped bookkeeping/workflow rows from that point in
time. Time Machine creates a safety checkpoint immediately before each restore
so a mistaken rollback can be reversed by restoring that safety checkpoint.

## Local Smoke Tests

Pull the local model:

```bash
ollama pull gemma4:26b-mlx
```

Run one model:

```bash
bun run ai:smoke:ollama -- --model gemma4:26b-mlx
```

Run the configured local model smoke/eval:

```bash
bun run ai:eval:ollama-models
```

## Removing Ollama Models

Flowybooks does not remove models for you. To free disk space, inspect and
remove models manually with Ollama:

```bash
ollama list
ollama rm old-model-name
```

You can also use Ollama's local API:

```bash
curl -X DELETE http://localhost:11434/api/delete \
  -H "Content-Type: application/json" \
  -d '{"name":"old-model-name"}'
```

Prefer `ollama rm` or the API over manually deleting files under
`~/.ollama/models`.
