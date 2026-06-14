# Adding Kevin Skills

Kevin is experimental. Skills should make him safer and more deterministic, not
more free-form.

## Pattern

- Classify the user intent before asking a model to produce structured output.
- Gather only the context needed for that intent.
- Ask the model for strict JSON.
- Validate the JSON with Zod.
- Pass validated proposals to deterministic accounting/import services.
- Require user confirmation before posting journals.

## Boundaries

- `lib/kevin/intent-router.ts` owns deterministic task routing.
- `lib/kevin/context-service.ts` owns ledger/document/memory retrieval.
- `lib/kevin/prompt-builder.ts` owns prompt construction.
- `lib/kevin/response-label-service.ts` owns source-label validation.
- `lib/kevin/service.ts` coordinates flows but should not collect new
  responsibilities when a smaller module can own them.

Kevin should not imply bank feeds, hosted bookkeeping, tax advisory authority,
or GAAP conclusions without the source gate.
