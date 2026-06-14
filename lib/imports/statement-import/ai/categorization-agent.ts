import { z } from 'zod';
import { generateStructuredObject } from '@/lib/kevin/model-client';
import { sanitizeForAICategorization } from '@/lib/redaction';

export type CategorizationInputTransaction = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
};

export type CategorizationInputAccount = {
  id: string;
  code: string;
  name: string;
  type: 'income' | 'expense' | 'asset' | 'liability' | 'equity';
  classification?: string | null;
  isActive: boolean;
};

const BankCategorizationItemSchema = z.object({
  transactionId: z.string(),
  suggestedAccountCode: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
});

const BankCategorizationResultSchema = z.object({
  items: z.array(BankCategorizationItemSchema),
});

export type BankCategorizationItem = z.infer<typeof BankCategorizationItemSchema>;
export type BankCategorizationResult = z.infer<typeof BankCategorizationResultSchema>;

export type CategorizationSuggestion = {
  transactionId: string;
  suggestedAccountCode: string | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

function parseTimeoutMs(envKey: string, fallbackMs: number) {
  const raw = process.env[envKey];
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function buildPrompt(params: {
  transactions: CategorizationInputTransaction[];
  accounts: CategorizationInputAccount[];
}): string {
  const { transactions, accounts } = params;

  const accountsJson = JSON.stringify(
    accounts.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      classification: account.classification ?? null,
      isActive: account.isActive,
    })),
  );

  const transactionsJson = JSON.stringify(
    transactions.map((tx) => ({
      id: tx.id,
      date: tx.date,
      description: sanitizeForAICategorization(tx.description),
      amountCents: tx.amountCents,
    })),
  );

  return [
    'You are a bank transaction categorization assistant for a double-entry accounting system.',
    '',
    'Your job:',
    '- For each transaction, choose the most appropriate GL account code from the provided chart of accounts.',
    '- If you are not confident, leave suggestedAccountCode = null and set confidence = "low".',
    '',
    'Rules:',
    '- ONLY use account codes from the provided accounts list.',
    '- Do not invent new account codes.',
    '- Positive amounts (amountCents > 0) usually mean money INTO the bank account (income, refunds, transfers).',
    '- Negative amounts (amountCents < 0) usually mean money OUT (expenses, payments).',
    '- If a transaction looks like an internal transfer and you cannot map it confidently, you may leave suggestedAccountCode = null.',
    '',
    'Return JSON that matches the given schema:',
    '- items: array of { transactionId, suggestedAccountCode | null, confidence, reason }.',
    '',
    'Here are the accounts (Chart of Accounts):',
    accountsJson,
    '',
    'Here are the transactions to categorize:',
    transactionsJson,
  ].join('\n');
}

export async function suggestCategoriesForTransactions(params: {
  transactions: CategorizationInputTransaction[];
  accounts: CategorizationInputAccount[];
}): Promise<CategorizationSuggestion[]> {
  const { transactions, accounts } = params;

  if (transactions.length === 0) {
    return [];
  }

  if (accounts.length === 0) {
    throw new Error('No accounts provided for categorization');
  }

  const startedAt = Date.now();
  const prompt = buildPrompt({ transactions, accounts });
  const timeoutMs = parseTimeoutMs('CATEGORIZATION_TIMEOUT_MS', 45_000);

  const { object, model, provider } = await generateStructuredObject<BankCategorizationResult>({
    schema: BankCategorizationResultSchema,
    prompt,
    timeoutMs,
  });

  const transactionIds = new Set(transactions.map((tx) => tx.id));
  const accountCodes = new Set(accounts.map((account) => account.code));

  const suggestions: CategorizationSuggestion[] = [];

  for (const item of object.items) {
    if (!transactionIds.has(item.transactionId)) {
      continue;
    }

    let suggestedAccountCode: string | null = item.suggestedAccountCode;

    if (suggestedAccountCode && !accountCodes.has(suggestedAccountCode)) {
      suggestedAccountCode = null;
    }

    suggestions.push({
      transactionId: item.transactionId,
      suggestedAccountCode,
      confidence: item.confidence,
      reason: item.reason,
    });
  }

  const latencyMs = Date.now() - startedAt;
  const confidenceCounts = suggestions.reduce(
    (counts, suggestion) => {
      counts[suggestion.confidence] += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0 },
  );

  const accountCodeCounts = suggestions.reduce<Record<string, number>>((counts, suggestion) => {
    if (!suggestion.suggestedAccountCode) return counts;
    counts[suggestion.suggestedAccountCode] = (counts[suggestion.suggestedAccountCode] ?? 0) + 1;
    return counts;
  }, {});

  console.info(
    JSON.stringify({
      event: 'ai.categorization',
      provider,
      model,
      promptChars: prompt.length,
      txCount: transactions.length,
      accountCount: accounts.length,
      suggestionCount: suggestions.length,
      confidenceCounts,
      accountCodeCounts,
      latencyMs,
    }),
  );

  return suggestions;
}
