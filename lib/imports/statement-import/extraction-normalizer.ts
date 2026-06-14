import type {
  ExtractedTransaction,
  StatementMetadata,
} from '@/lib/imports/statement-import/extractors/schemas';

export type StatementExtractionIssue = {
  code:
    | 'missing_statement_period'
    | 'invalid_statement_period'
    | 'out_of_period_transactions'
    | 'invalid_transaction_date'
    | 'invalid_transaction_amount';
  message: string;
  details?: Record<string, unknown>;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidYmdParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function toYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function normalizeDateToYmd(value: unknown): string | null {
  const raw = normalizeOptionalString(value);
  if (!raw) return null;

  const ymdMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    if (!isValidYmdParts(year, month, day)) return null;
    return toYmd(year, month, day);
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const yearRaw = slashMatch[3]!;
    const year = yearRaw.length === 4 ? Number(yearRaw) : Number(yearRaw) + 2000;
    if (!isValidYmdParts(year, month, day)) return null;
    return toYmd(year, month, day);
  }

  const ySlashMatch = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ySlashMatch) {
    const year = Number(ySlashMatch[1]);
    const month = Number(ySlashMatch[2]);
    const day = Number(ySlashMatch[3]);
    if (!isValidYmdParts(year, month, day)) return null;
    return toYmd(year, month, day);
  }

  const monthNameMatch = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/);
  if (monthNameMatch) {
    const monthName = monthNameMatch[1]!.toLowerCase();
    const month = MONTH_MAP[monthName];
    const day = Number(monthNameMatch[2]);
    const year = Number(monthNameMatch[3]);
    if (!month || !isValidYmdParts(year, month, day)) return null;
    return toYmd(year, month, day);
  }

  return null;
}

function normalizeAmountToCents(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    if (Number.isInteger(value)) return value;
    // Heuristic: if the model output looks like dollars, convert to cents.
    if (Math.abs(value) < 1_000_000) {
      return Math.round(value * 100);
    }
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/^\((.*)\)$/, '-$1').replace(/[$,]/g, '');
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    if (cleaned.includes('.')) return Math.round(num * 100);
    return Math.trunc(num);
  }

  return null;
}

export function normalizeStatementExtraction(params: {
  metadata: StatementMetadata;
  transactions: ExtractedTransaction[];
}): {
  metadata: StatementMetadata;
  transactions: ExtractedTransaction[];
  issues: StatementExtractionIssue[];
} {
  const issues: StatementExtractionIssue[] = [];

  const hadStartDate = Boolean(normalizeOptionalString(params.metadata.startDate));
  const hadEndDate = Boolean(normalizeOptionalString(params.metadata.endDate));
  const startDate = normalizeDateToYmd(params.metadata.startDate);
  const endDate = normalizeDateToYmd(params.metadata.endDate);

  if (!startDate || !endDate) {
    issues.push({
      code: hadStartDate || hadEndDate ? 'invalid_statement_period' : 'missing_statement_period',
      message:
        hadStartDate || hadEndDate
          ? 'Statement period start/end dates were extracted but could not be parsed as dates. Import is allowed, but out-of-period checks are unavailable.'
          : 'Statement period start/end dates were not extracted. Import is allowed, but out-of-period checks are unavailable.',
      details: {
        extractedStartDate: params.metadata.startDate ?? null,
        extractedEndDate: params.metadata.endDate ?? null,
      },
    });
  }

  const beginningBalanceCents = normalizeAmountToCents(params.metadata.beginningBalanceCents);
  const endingBalanceCents = normalizeAmountToCents(params.metadata.endingBalanceCents);

  const normalizedMetadata: StatementMetadata = {
    ...params.metadata,
    institutionName: normalizeOptionalString(params.metadata.institutionName) ?? null,
    accountNumber: normalizeOptionalString(params.metadata.accountNumber) ?? null,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    beginningBalanceCents,
    endingBalanceCents,
    reconciliationAdjustments: params.metadata.reconciliationAdjustments
      ?.map((item) => {
        if (!item || typeof item !== 'object') return null;
        const description = normalizeOptionalString(item.description);
        const amountCents = normalizeAmountToCents(item.amountCents);
        if (!description || amountCents === null) return null;
        return {
          description: normalizeWhitespace(description),
          amountCents,
        };
      })
      .filter(Boolean) as StatementMetadata['reconciliationAdjustments'],
  };

  const normalizedTransactions: ExtractedTransaction[] = [];

  for (const [index, tx] of params.transactions.entries()) {
    const lineNumber = index + 1;
    const date = normalizeDateToYmd(tx.date);
    if (!date) {
      issues.push({
        code: 'invalid_transaction_date',
        message: 'A transaction date could not be parsed and was skipped.',
        details: {
          lineNumber,
          extractedDate: tx.date,
          rawDescription: tx.rawDescription,
          amountCents: tx.amountCents,
        },
      });
      continue;
    }

    const amountCents = normalizeAmountToCents(tx.amountCents);
    if (amountCents === null) {
      issues.push({
        code: 'invalid_transaction_amount',
        message: 'A transaction amount could not be parsed and was skipped.',
        details: {
          lineNumber,
          date,
          rawDescription: tx.rawDescription,
          extractedAmountCents: tx.amountCents,
        },
      });
      continue;
    }

    const description =
      normalizeOptionalString(tx.description) ??
      normalizeOptionalString(tx.rawDescription) ??
      'Transaction';

    const rawDescription = normalizeOptionalString(tx.rawDescription) ?? description;
    const checkNumber = normalizeOptionalString(tx.checkNumber) ?? null;

    normalizedTransactions.push({
      date,
      description: normalizeWhitespace(description),
      rawDescription,
      amountCents,
      checkNumber,
    });
  }

  return {
    metadata: normalizedMetadata,
    transactions: normalizedTransactions,
    issues,
  };
}
