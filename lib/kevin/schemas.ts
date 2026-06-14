// Zod schemas for Kevin's structured responses and journal proposals.
// Keep these strict because model output is untrusted until validated.
import { z } from 'zod';

import { KevinAnswerLabelSchema } from './source-tiers';

export const KevinAccountTypeSchema = z.enum(['asset', 'liability', 'equity', 'income', 'expense']);

export const KevinAccountClassificationSchema = z.enum([
  'current_asset',
  'noncurrent_asset',
  'fixed_asset',
  'other_asset',
  'current_liability',
  'noncurrent_liability',
  'other_liability',
  'equity',
  'common_stock',
  'preferred_stock',
  'additional_paid_in_capital',
  'treasury_stock',
  'retained_earnings',
  'dividends_equity',
  'foreign_currency_translation',
  'other_equity',
  'income',
  'sales',
  'interest_income',
  'dividend_income',
  'other_income',
  'expense',
  'operating_expense',
  'cogs',
  'depreciation',
  'fixed_costs',
  'variable_expenses',
  'other_expense',
]);

export const KevinAccountProposalSchema = z.object({
  accounts: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        code: z
          .string()
          .regex(/^\d{5}$/)
          .optional()
          .nullable(),
        type: KevinAccountTypeSchema,
        classification: KevinAccountClassificationSchema,
        isStatementAccount: z.boolean().default(false),
        reason: z.string().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(12),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().max(500).optional().nullable(),
});

export const KevinJournalProposalLineSchema = z.object({
  accountCode: z.string().min(1),
  accountName: z.string().optional().nullable(),
  debitCents: z.number().int().nonnegative(),
  creditCents: z.number().int().nonnegative(),
  memo: z.string().optional().nullable(),
});

export const KevinJournalProposalSchema = z.object({
  description: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(KevinJournalProposalLineSchema).min(2),
  factsUsed: z.array(z.string()).default([]),
  missingFacts: z.array(z.string()).default([]),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const KevinResponseSchema = z.object({
  answerLabel: KevinAnswerLabelSchema,
  answer: z.string(),
  citations: z.array(z.string()).default([]),
  followUpQuestions: z.array(z.string()).default([]),
  journalProposal: KevinJournalProposalSchema.nullable().default(null),
  memoryWrites: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        value: z.string().min(1),
        category: z.string().min(1).max(60).default('general'),
      }),
    )
    .default([]),
});

export type KevinJournalProposal = z.infer<typeof KevinJournalProposalSchema>;
export type KevinResponse = z.infer<typeof KevinResponseSchema>;
export type KevinAccountProposal = z.infer<typeof KevinAccountProposalSchema>;
