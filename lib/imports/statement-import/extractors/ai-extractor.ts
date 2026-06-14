import { generateStructuredObject } from '@/lib/kevin/model-client';
import { redactHighRiskPII } from '@/lib/redaction';
import {
  statementExtractionSchema,
  statementMetadataSchema,
  statementTransactionsOnlySchema,
  type StatementExtraction,
} from './schemas';

const EXTRACTION_PROMPT = `You are a financial document parser. Extract all transactions and metadata from this bank/financial statement.

Instructions:
1. Identify the statement type (bank_statement, credit_card_statement, loan, etc.)
2. Extract the institution name, account number (last 4 digits only), and statement period dates
   - If you cannot find any of these, set them to null.
3. Extract beginning and ending balances/values in CENTS (multiply dollars by 100) if explicitly shown; otherwise set to null.
   - For bank statements: use cash balance.
4. If the statement shows non-transaction value changes (ex: unrealized gain/loss, market change), extract them under metadata.reconciliationAdjustments.
   These are used ONLY for reconciliation and should NOT become transactions.
5. Extract ALL transactions with:
   - Date in YYYY-MM-DD format
   - Clean description (remove extra spaces, normalize merchant names)
   - Raw description (exactly as shown)
   - Amount in CENTS, normalized by money flow direction:
     * POSITIVE = money INTO the account (deposits, credits, refunds, interest earned)
     * NEGATIVE = money OUT OF the account (withdrawals, payments, purchases, fees, checks)
     * Note: Banks use different labels (debit/credit, withdrawal/deposit, cash out/in).
       Focus on whether the customer's balance increased (+) or decreased (-).
6. Include check numbers when visible
7. ONLY include transactions that appear as booked line items with explicit amounts in the statement's activity/transaction table.
   Do NOT invent transactions from narrative text, footnotes, or labels. If a fee is mentioned but does not appear as a booked amount, do not include it.
8. Do NOT filter transactions based on the statement period. Use the exact dates printed on the statement; do not shift dates by timezone or by one day.

Statement text:
`;

const METADATA_PROMPT = `You are a financial document parser. Extract ONLY the statement metadata from this statement header/body text.

Instructions:
1. Identify the statement type (bank_statement, credit_card_statement, sba_loan, etc.)
2. Extract the institution name, account number (last 4 digits only), and statement period dates
   - If you cannot find any of these, set them to null.
3. Extract beginning and ending balances/values in CENTS (multiply dollars by 100) if explicitly shown; otherwise set to null.
   - For bank statements: use cash balance.
4. If the statement shows non-transaction value changes (ex: unrealized gain/loss, market change), extract them under metadata.reconciliationAdjustments.
   These are used ONLY for reconciliation and should NOT become transactions.
5. Use exact dates printed on the statement (YYYY-MM-DD)

Statement text:
`;

function parseTimeoutMs(envKey: string, fallbackMs: number) {
  const raw = process.env[envKey];
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function splitIntoChunks(text: string, maxChars: number) {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + maxChars);
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.name === 'TimeoutError';
}

function isSchemaMismatchError(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === 'NoObjectGeneratedError') return true;
  const message = error.message.toLowerCase();
  return (
    message.includes('no object generated') ||
    message.includes('did not match schema') ||
    message.includes('response did not match schema')
  );
}

function shouldFallbackToChunkExtraction(error: unknown) {
  return isTimeoutError(error) || isSchemaMismatchError(error);
}

export interface ExtractionResult {
  extraction: StatementExtraction;
  model: string;
}

export async function extractStatementWithAI(
  pdfText: string,
  options?: {
    statementTypeHint?: StatementExtraction['metadata']['statementType'] | undefined;
  },
): Promise<ExtractionResult> {
  const redactedPdfText = redactHighRiskPII(pdfText);
  const extractionTimeoutMs = parseTimeoutMs('EXTRACTION_TIMEOUT_MS', 240_000);
  const metadataTimeoutMs = parseTimeoutMs('EXTRACTION_METADATA_TIMEOUT_MS', 45_000);
  const chunkTimeoutMs = parseTimeoutMs('EXTRACTION_CHUNK_TIMEOUT_MS', 60_000);

  try {
    const { object, model } = await generateStructuredObject<StatementExtraction>({
      schema: statementExtractionSchema,
      prompt: EXTRACTION_PROMPT + redactedPdfText,
      timeoutMs: extractionTimeoutMs,
    });

    return {
      extraction: object,
      model,
    };
  } catch (error) {
    if (!shouldFallbackToChunkExtraction(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[statement-import] extraction fallback: ${message}`);
  }

  const headerText = redactedPdfText.slice(0, 20_000);
  let metadata: StatementExtraction['metadata'];
  let metadataModel = 'unknown';

  try {
    const result = await generateStructuredObject({
      schema: statementMetadataSchema,
      prompt: METADATA_PROMPT + headerText,
      timeoutMs: metadataTimeoutMs,
    });
    metadata = result.object;
    metadataModel = result.model;
  } catch (error) {
    if (!shouldFallbackToChunkExtraction(error)) {
      throw error;
    }

    const hint = options?.statementTypeHint;
    metadata = {
      statementType: hint ?? 'bank_statement',
      institutionName: null,
      accountNumber: null,
      startDate: null,
      endDate: null,
      beginningBalanceCents: null,
      endingBalanceCents: null,
    };
  }

  const transactionPromptPrefix = `You are a financial document parser. Extract ONLY transactions from this statement text chunk.

Instructions:
- Output ONLY transactions you can see in THIS chunk (it may be partial).
- Date must be YYYY-MM-DD.
- AmountCents must be an integer in cents; POSITIVE = money IN; NEGATIVE = money OUT.
- Keep rawDescription exactly as shown; description should be cleaned.
- ONLY include transactions that appear as booked line items with explicit amounts in the statement's activity/transaction table.
- Do NOT invent transactions from narrative text, footnotes, or labels.

Statement text chunk:
`;

  const chunks = splitIntoChunks(redactedPdfText, 60_000);
  console.info(
    `[statement-import] extraction fallback: chunked transactions (${chunks.length} chunks, textLength=${redactedPdfText.length})`,
  );

  const allTransactions: StatementExtraction['transactions'] = [];

  for (const chunk of chunks) {
    try {
      const { object } = await generateStructuredObject({
        schema: statementTransactionsOnlySchema,
        prompt: transactionPromptPrefix + chunk,
        timeoutMs: chunkTimeoutMs,
      });
      allTransactions.push(...object.transactions);
    } catch (error) {
      if (shouldFallbackToChunkExtraction(error)) {
        continue;
      }
      throw error;
    }
  }

  const dedupeKeyToTx = new Map<string, StatementExtraction['transactions'][number]>();

  for (const tx of allTransactions) {
    const txDate = new Date(tx.date);
    if (Number.isNaN(txDate.getTime())) continue;

    const key = [tx.date, tx.rawDescription, tx.amountCents, tx.checkNumber ?? ''].join('|');

    if (!dedupeKeyToTx.has(key)) {
      dedupeKeyToTx.set(key, tx);
    }
  }

  const combined: StatementExtraction = {
    metadata,
    transactions: Array.from(dedupeKeyToTx.values()),
  };

  const validated = statementExtractionSchema.parse(combined);

  return {
    extraction: validated,
    model: metadataModel,
  };
}
