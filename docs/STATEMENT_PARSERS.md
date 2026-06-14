# Adding Statement Parsers

Statement import code lives under `lib/imports/statement-import/**`.

## Pipeline

1. Upload validation.
2. Source text extraction.
3. Statement classification.
4. Transaction extraction.
5. Transaction normalization.
6. Categorization.
7. Review state.
8. Deterministic posting.

## Rules

- Bank and credit-card sign logic must be deterministic and tested.
- AI output is advisory until normalized and validated.
- Posting must happen inside a transaction.
- Linked accounts and category accounts must belong to the current org.
- Idempotency matters: retrying an import should not duplicate posted journals.

## Tests

Add tests for bank deposits/withdrawals, credit-card charges/payments, ambiguous
classification, mismatched linked accounts, allocations, excluded transactions,
posting, unposting, and reposting.
