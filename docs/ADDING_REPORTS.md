# Adding Reports

Reports live in `lib/accounting/reports/**` and should remain independent from
React. Pages and export routes should call report services rather than assemble
ledger queries themselves.

## Checklist

- Accept explicit `orgId` and date/filter inputs.
- Query posted journal batches only unless the report explicitly says otherwise.
- Use the shared accounting date utilities.
- Return plain serializable data that UI and CSV exports can share.
- Add tests for empty books, posted activity, voided activity, and date
  boundaries.

## UI And Export Pattern

- Server page loads the report data.
- Report controls own form state and navigation.
- CSV export route reuses the same report service.
- Export formatting belongs in a small adapter, not the report calculation.
