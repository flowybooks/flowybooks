import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { accounts } from '@/lib/db/schema';
import {
  createDraftJournalBatch,
  createPostedJournalBatch,
  DuplicateJournalBatchError,
  type CreateJournalBatchInput,
  type CreateJournalLineInput,
} from '@/lib/accounting/journal-service';
import { calculateJournalTotals } from '@/lib/accounting/journals';

export type CsvJournalStatus = 'draft' | 'posted';

// One CSV row
export type CsvJournalLine = {
  glDate: Date;
  narration: string;
  description: string;
  glAccount: string;
  debit: number;
  credit: number;
  tag1?: string | undefined;
  tag2?: string | undefined;
  tag3?: string | undefined;
  tag4?: string | undefined;
  tag5?: string | undefined;
};

export type CsvJournalImportInput = {
  orgId: number;
  createdByUserId?: number | undefined;
  status?: CsvJournalStatus | undefined; // default 'draft'
  lines: CsvJournalLine[];
  /**
   * If true, skip batches that already exist (based on source deduplication).
   * If false (default), throw an error when a duplicate is detected.
   */
  skipExisting?: boolean | undefined;
};

export type CsvJournalImportResult = {
  batches: { batchId: string; narration: string }[];
  totals: { totalDebit: number; totalCredit: number };
  /** Narrations of batches that were skipped because they already exist. */
  skippedDuplicates: { narration: string; existingBatchId: string }[];
};

export async function importCsvJournals(
  input: CsvJournalImportInput,
): Promise<CsvJournalImportResult> {
  if (input.lines.length === 0) {
    throw new Error('Import must include at least one line');
  }

  const status: CsvJournalStatus = input.status ?? 'draft';
  if (status !== 'draft' && status !== 'posted') {
    throw new Error(`Unsupported journal status: ${status}`);
  }

  // 1. Per-line validation: non-negative, exactly one side > 0
  for (const [index, line] of input.lines.entries()) {
    if (line.debit < 0 || line.credit < 0) {
      throw new Error(`Line ${index + 1}: debit and credit must be non-negative`);
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new Error(`Line ${index + 1}: debit and credit cannot both be > 0`);
    }
    if (line.debit === 0 && line.credit === 0) {
      throw new Error(`Line ${index + 1}: either debit or credit must be > 0`);
    }
  }

  // 2. Resolve GL account codes to IDs for this org
  const codes = Array.from(new Set(input.lines.map((l) => l.glAccount)));
  const accountRows = await db
    .select({ id: accounts.id, code: accounts.code })
    .from(accounts)
    .where(and(eq(accounts.orgId, input.orgId), inArray(accounts.code, codes)));

  if (accountRows.length !== codes.length) {
    const foundCodes = new Set(accountRows.map((row) => row.code));
    const missingCodes = codes.filter((code) => !foundCodes.has(code));
    throw new Error(`Unknown GL account code(s) for this organization: ${missingCodes.join(', ')}`);
  }

  const codeToId = new Map(accountRows.map((row) => [row.code, row.id]));

  // 3. Group lines by narration => individual journal batches
  const batchesByNarration = new Map<string, CsvJournalLine[]>();
  for (const line of input.lines) {
    const key = line.narration.trim();
    if (!key) {
      throw new Error('Lines must include a Narration to group journals');
    }
    const bucket = batchesByNarration.get(key) ?? [];
    bucket.push(line);
    batchesByNarration.set(key, bucket);
  }

  const createdBatches: { batchId: string; narration: string }[] = [];
  const skippedDuplicates: { narration: string; existingBatchId: string }[] = [];
  const allLinesForTotals: { debit: number; credit: number; glDate: Date }[] = [];

  // 4. For each narration group, enforce single GL date and balanced totals
  for (const [narration, lines] of batchesByNarration.entries()) {
    const first = lines[0];
    if (!first) {
      continue;
    }
    const glDate = first.glDate;

    const mismatchedDate = lines.some((line) => line.glDate.getTime() !== glDate.getTime());
    if (mismatchedDate) {
      throw new Error(
        `Journal with narration "${narration}" has multiple GL dates; each journal must use a single GL Date.`,
      );
    }

    const journalLines: CreateJournalLineInput[] = lines.map((line) => {
      const debitCents = Math.round(line.debit * 100);
      const creditCents = Math.round(line.credit * 100);

      allLinesForTotals.push({
        debit: debitCents,
        credit: creditCents,
        glDate,
      });

      return {
        accountId: codeToId.get(line.glAccount)!,
        glDate,
        debit: debitCents,
        credit: creditCents,
        narration: line.description,
      };
    });

    const totalsForJournal = calculateJournalTotals(journalLines);
    if (totalsForJournal.totalDebit !== totalsForJournal.totalCredit) {
      throw new Error(
        `Journal with narration "${narration}" is not balanced (debits ${totalsForJournal.totalDebit} != credits ${totalsForJournal.totalCredit})`,
      );
    }

    const batchInput: CreateJournalBatchInput = {
      orgId: input.orgId,
      date: glDate,
      description: narration,
      createdByUserId: input.createdByUserId,
      lines: journalLines,
    };

    try {
      const result =
        status === 'posted'
          ? await createPostedJournalBatch(batchInput, {
              sourceType: 'csv_import',
              sourceRef: { narration, glDate: glDate.toISOString() },
            })
          : await createDraftJournalBatch(batchInput, {
              sourceType: 'csv_import',
              sourceRef: { narration, glDate: glDate.toISOString() },
            });

      createdBatches.push({ batchId: result.batchId, narration });
    } catch (error) {
      if (error instanceof DuplicateJournalBatchError) {
        if (input.skipExisting) {
          // Record this as skipped and continue processing other batches
          skippedDuplicates.push({
            narration,
            existingBatchId: error.existingBatchId,
          });
          continue;
        }
        // Re-throw with more context about which narration caused the issue
        throw new Error(
          `Duplicate journal detected for narration "${narration}": ${error.message}`,
        );
      }
      throw error; // Re-throw other errors as-is
    }
  }

  const globalTotals = calculateJournalTotals(
    allLinesForTotals.map((l) => ({ debit: l.debit, credit: l.credit })),
  );

  if (globalTotals.totalDebit !== globalTotals.totalCredit) {
    throw new Error(
      `Combined journals are not balanced (debits ${globalTotals.totalDebit} != credits ${globalTotals.totalCredit})`,
    );
  }

  // 5. Per-GL-date balance: for each distinct GL date, debits must equal credits
  const totalsByDate = new Map<string, { totalDebit: number; totalCredit: number }>();

  for (const entry of allLinesForTotals) {
    const key = entry.glDate.toISOString().slice(0, 10); // YYYY-MM-DD
    const current = totalsByDate.get(key) ?? {
      totalDebit: 0,
      totalCredit: 0,
    };
    current.totalDebit += entry.debit;
    current.totalCredit += entry.credit;
    totalsByDate.set(key, current);
  }

  for (const [dateKey, totals] of totalsByDate.entries()) {
    if (totals.totalDebit !== totals.totalCredit) {
      throw new Error(
        `Debits and credits are not balanced for GL Date ${dateKey} (debits ${totals.totalDebit} != credits ${totals.totalCredit})`,
      );
    }
  }

  return {
    batches: createdBatches,
    totals: globalTotals,
    skippedDuplicates,
  };
}
