import { z } from 'zod';
import { generateStructuredObject } from '@/lib/kevin/model-client';
import type {
  ExtractedTransaction,
  StatementMetadata,
} from '@/lib/imports/statement-import/extractors/schemas';

const reconciliationAdjustmentSchema = z.object({
  description: z.string(),
  amountCents: z.number().int(),
});

const reconciliationResolutionSchema = z.object({
  excludeLineNumbers: z
    .array(z.number().int())
    .describe('1-based lineNumbers of extracted transactions to exclude'),
  additionalAdjustments: z
    .array(reconciliationAdjustmentSchema)
    .describe(
      'Optional value-change lines (e.g., unrealized gain/loss) explicitly shown on the statement. If applied, they will be created as synthetic valuation transactions (not activity-table transactions) dated at the statement end date.',
    ),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning: z.string().describe('Short explanation of the proposed resolution'),
});

export type ReconciliationResolution = z.infer<typeof reconciliationResolutionSchema>;

function formatCents(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
}

function findCandidateExclusionSetsBySum(params: {
  transactions: Array<{ lineNumber: number; amountCents: number }>;
  targetSumCents: number;
  toleranceCents: number;
  maxSetSize: number;
  maxSets: number;
}): number[][] {
  const { transactions, targetSumCents, toleranceCents, maxSetSize, maxSets } = params;

  if (targetSumCents === 0) return [];

  const signWanted = Math.sign(targetSumCents);

  const candidates = transactions
    .filter((tx) => (signWanted > 0 ? tx.amountCents > 0 : tx.amountCents < 0))
    .filter((tx) => Math.abs(tx.amountCents) <= Math.abs(targetSumCents) + toleranceCents)
    .slice(0, 200);

  const results: number[][] = [];

  for (let size = 1; size <= Math.max(1, maxSetSize); size += 1) {
    if (results.length >= maxSets) break;

    if (size === 1) {
      for (const tx of candidates) {
        const sum = tx.amountCents;
        if (Math.abs(sum - targetSumCents) <= toleranceCents) {
          results.push([tx.lineNumber]);
          if (results.length >= maxSets) break;
        }
      }
      continue;
    }

    if (size === 2) {
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          const first = candidates[i]!;
          const second = candidates[j]!;
          const sum = first.amountCents + second.amountCents;
          if (Math.abs(sum - targetSumCents) <= toleranceCents) {
            results.push([first.lineNumber, second.lineNumber]);
            if (results.length >= maxSets) break;
          }
        }
        if (results.length >= maxSets) break;
      }
      continue;
    }

    if (size === 3) {
      for (let i = 0; i < candidates.length; i += 1) {
        for (let j = i + 1; j < candidates.length; j += 1) {
          for (let k = j + 1; k < candidates.length; k += 1) {
            const first = candidates[i]!;
            const second = candidates[j]!;
            const third = candidates[k]!;
            const sum = first.amountCents + second.amountCents + third.amountCents;
            if (Math.abs(sum - targetSumCents) <= toleranceCents) {
              results.push([first.lineNumber, second.lineNumber, third.lineNumber]);
              if (results.length >= maxSets) break;
            }
          }
          if (results.length >= maxSets) break;
        }
        if (results.length >= maxSets) break;
      }
      continue;
    }
  }

  const unique = new Set<string>();
  const deduped: number[][] = [];

  for (const set of results) {
    const sorted = [...set].sort((a, b) => a - b);
    const key = sorted.join(',');
    if (unique.has(key)) continue;
    unique.add(key);
    deduped.push(sorted);
  }

  return deduped.slice(0, maxSets);
}

const RESOLUTION_PROMPT = `You are helping reconcile extracted statement activity to the statement's beginning/ending balance.

We have:
- expectedDeltaCents = endingBalanceCents - beginningBalanceCents
- capturedDeltaCents = sum(extracted transaction amounts) + sum(reconciliationAdjustments)
- diffCents = expectedDeltaCents - capturedDeltaCents

Your job:
1) If diffCents != 0, determine whether any extracted "transactions" are NOT actually booked line items (e.g., narrative mentions, informational notes, fees paid by a correspondent/third party, waived fees) and should be EXCLUDED.
2) Optionally, you may add "additionalAdjustments" ONLY if the statement explicitly shows value changes (e.g., unrealized gain/loss, market value change) that explain the remaining diff. If applied, these will be created as synthetic valuation transactions (dated at the statement end date).

Rules:
- Do NOT invent new transactions.
- Prefer the smallest set of exclusions needed.
- Only exclude when you are confident the line is not a booked debit/credit activity item.
- If you are not confident, return empty lists and confidence=low.

Input:
`;

export async function resolveReconciliationMismatchWithAI(params: {
  statementText: string;
  metadata: StatementMetadata;
  transactions: ExtractedTransaction[];
  expectedDeltaCents: number;
  capturedDeltaCents: number;
  diffCents: number;
  toleranceCents: number;
  timeoutMs?: number;
}): Promise<ReconciliationResolution> {
  const txsWithLineNumbers = params.transactions.map((tx, index) => ({
    lineNumber: index + 1,
    date: tx.date,
    description: tx.description,
    rawDescription: tx.rawDescription,
    amountCents: tx.amountCents,
  }));

  const candidateSets = findCandidateExclusionSetsBySum({
    transactions: txsWithLineNumbers.map((tx) => ({
      lineNumber: tx.lineNumber,
      amountCents: tx.amountCents,
    })),
    targetSumCents: -params.diffCents,
    toleranceCents: params.toleranceCents,
    maxSetSize: 3,
    maxSets: 8,
  });

  const compactStatementText =
    params.statementText.length > 30_000
      ? `${params.statementText.slice(0, 30_000)}\n...[truncated]...`
      : params.statementText;

  const promptPayload = {
    metadata: {
      institutionName: params.metadata.institutionName,
      accountNumber: params.metadata.accountNumber,
      startDate: params.metadata.startDate,
      endDate: params.metadata.endDate,
      beginningBalanceCents: params.metadata.beginningBalanceCents ?? null,
      endingBalanceCents: params.metadata.endingBalanceCents ?? null,
      existingAdjustments: params.metadata.reconciliationAdjustments ?? [],
    },
    reconciliation: {
      expectedDeltaCents: params.expectedDeltaCents,
      capturedDeltaCents: params.capturedDeltaCents,
      diffCents: params.diffCents,
      expectedDelta: formatCents(params.expectedDeltaCents),
      capturedDelta: formatCents(params.capturedDeltaCents),
      diff: formatCents(params.diffCents),
      toleranceCents: params.toleranceCents,
    },
    extractedTransactions: txsWithLineNumbers,
    candidateExclusionSets: candidateSets,
    statementTextExcerpt: compactStatementText,
  };

  const { object } = await generateStructuredObject({
    schema: reconciliationResolutionSchema,
    prompt: RESOLUTION_PROMPT + JSON.stringify(promptPayload, null, 2),
    timeoutMs: params.timeoutMs ?? 45_000,
  });

  return object;
}
