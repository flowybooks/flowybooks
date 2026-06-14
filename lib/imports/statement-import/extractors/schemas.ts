import { z } from 'zod';

// The type of financial statement
export const statementTypeSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '');

    if (normalized.includes('credit') && normalized.includes('card')) {
      return 'credit_card_statement';
    }
    if (normalized.includes('bank') && normalized.includes('statement')) {
      return 'bank_statement';
    }
    if (normalized === 'bank') return 'bank_statement';
    if (normalized === 'credit_card') return 'credit_card_statement';

    return value;
  },
  z.enum([
    'bank_statement',
    'credit_card_statement',
    'sba_loan',
    'factoring_loan',
    'secured_loan',
    'auto_loan',
    'lease',
  ]),
);

function coerceNumber(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  const cleaned = trimmed
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[$,_\s]/g, '')
    .replace(/,/g, '');

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : value;
}

const centsLikeNumberSchema = z
  .preprocess(coerceNumber, z.number())
  .describe(
    'Amount in cents. Positive increases the account balance/value; negative decreases it.',
  );

const reconciliationAdjustmentSchema = z.object({
  description: z.string().describe('Label as shown on the statement'),
  amountCents: z
    .preprocess(coerceNumber, z.number())
    .describe(
      'Amount in cents. Positive increases the account balance/value; negative decreases it.',
    ),
});

// Metadata extracted from the statement header
export const statementMetadataSchema = z.object({
  statementType: statementTypeSchema,
  institutionName: z
    .string()
    .nullable()
    .optional()
    .describe('Name of the bank or financial institution'),
  accountNumber: z.string().nullable().optional().describe('Last 4 digits of account number only'),
  startDate: z
    .string()
    .nullable()
    .optional()
    .describe('Statement period start date in YYYY-MM-DD format'),
  endDate: z
    .string()
    .nullable()
    .optional()
    .describe('Statement period end date in YYYY-MM-DD format'),
  beginningBalanceCents: z
    .preprocess(coerceNumber, z.number())
    .nullable()
    .optional()
    .describe(
      'Beginning balance/value in cents (e.g., $100.50 = 10050). Null if not explicitly shown.',
    ),
  endingBalanceCents: z
    .preprocess(coerceNumber, z.number())
    .nullable()
    .optional()
    .describe('Ending balance/value in cents. Null if not explicitly shown.'),
  reconciliationAdjustments: z
    .array(reconciliationAdjustmentSchema)
    .optional()
    .describe(
      'Balance/value changes explicitly shown on the statement but not listed as activity-table transactions (e.g., unrealized gain/loss). These may be converted into synthetic valuation transactions if needed to reconcile the statement.',
    ),
});

// A single transaction from the statement
export const extractedTransactionSchema = z.object({
  date: z.string().describe('Transaction date in YYYY-MM-DD format'),
  description: z.string().describe('Clean, readable description of the transaction'),
  rawDescription: z.string().describe('Original description exactly as it appears'),
  amountCents: centsLikeNumberSchema.describe(
    'Amount in cents. Positive for money IN (deposits, credits, refunds). Negative for money OUT (withdrawals, payments, expenses).',
  ),
  checkNumber: z.string().nullable().optional().describe('Check number if this is a check payment'),
});

export const statementTransactionsOnlySchema = z.object({
  transactions: z.array(extractedTransactionSchema),
});

// Complete extraction result
export const statementExtractionSchema = z.object({
  metadata: statementMetadataSchema,
  transactions: z.array(extractedTransactionSchema),
});

// TypeScript types inferred from schemas
export type StatementType = z.infer<typeof statementTypeSchema>;
export type StatementMetadata = z.infer<typeof statementMetadataSchema>;
export type ExtractedTransaction = z.infer<typeof extractedTransactionSchema>;
export type StatementExtraction = z.infer<typeof statementExtractionSchema>;
