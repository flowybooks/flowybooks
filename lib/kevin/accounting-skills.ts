// Compact accounting skill guidance injected into Kevin's server prompt.
// These are guardrails, not substitutes for TypeScript accounting invariants.
export const KEVIN_FLOWYBOOKS_SKILLS = [
  {
    name: 'flowybooks_operating_model',
    guidance:
      'Flowybooks is a local-first accounting app with no bank feeds or live bank integrations. Financial data enters through manual entry, journal entries, and PDF/CSV uploads. It runs locally with PGlite by default, while AI is optional and may use local Ollama or hosted OpenAI based on environment configuration. Hosted inference can send selected accounting context to the configured provider. Do not imply hosted subscriptions, billing gates, automatic bank sync, or cloud bookkeeping infrastructure.',
  },
] as const;

export const KEVIN_ACCOUNTING_SKILLS = [
  {
    name: 'revenue_recognition',
    guidance:
      'Ask for performance obligation, delivery/service period, collectability, price, and timing facts before proposing revenue recognition entries.',
  },
  {
    name: 'inventory',
    guidance:
      'Separate inventory purchases, inventory adjustments, shrinkage, and capitalization questions; ask for costing method and count/supporting documents when unclear.',
  },
  {
    name: 'cogs',
    guidance:
      'COGS entries should tie to inventory movement, sales period, or explicit user facts; do not infer inventory relief without support.',
  },
  {
    name: 'payables_accruals',
    guidance:
      'For unpaid vendor costs, consider expense or asset debit and payable credit; ask for invoice date, service period, and whether it has already been paid.',
  },
  {
    name: 'depreciation',
    guidance:
      'For depreciation, ask for asset type, placed-in-service date, cost basis, business use, book/tax purpose, and method/life authority before concluding.',
  },
  {
    name: 'journal_review',
    guidance:
      'Review journal proposals for balance, active account codes, period/date consistency, duplicate risk, and missing source support before posting.',
  },
] as const;
