import { normalizeTransactionAmountsForStatementType } from './transaction-normalizer';
import type { StatementType } from './extractors/schemas';
import { csvTextToRecords } from '@/lib/utils/csv';

type ParsedRow = {
  date: string;
  description: string;
  rawDescription: string;
  amountCents: number;
  checkNumber?: string | null | undefined;
};

type ColumnMapping = {
  date?: string | undefined;
  description?: string | undefined;
  rawDescription?: string | undefined;
  amount?: string | undefined;
  debit?: string | undefined;
  credit?: string | undefined;
  checkNumber?: string | undefined;
};

function toCents(amount: string | number): number | null {
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount * 100);
  }

  const cleaned = String(amount)
    .trim()
    // Convert parentheses to negative
    .replace(/^\((.*)\)$/, '-$1')
    // Remove currency symbols and commas
    .replace(/[$,]/g, '');

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function toDateString(value: unknown): string | null {
  const str = String(value ?? '').trim();
  if (!str) return null;

  // Handle Date objects directly (assume they are already date-only or UTC)
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  // Parse mm/dd/yyyy, mm-dd-yyyy, yyyy-mm-dd
  const match = str.match(/^\s*(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})/);
  if (!match) return null;

  const [, a = '', b = '', c = ''] = match;
  // If first part is 4 digits, assume yyyy-mm-dd
  let year: number;
  let month: number;
  let day: number;

  if (a.length === 4) {
    year = Number(a);
    month = Number(b);
    day = Number(c);
  } else if (c.length === 4) {
    year = Number(c);
    month = Number(a);
    day = Number(b);
  } else {
    // Fallback: treat c as year with century 20xx
    year = Number(c.length === 2 ? `20${c}` : c);
    month = Number(a);
    day = Number(b);
  }

  if (!year || !month || !day) return null;

  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function normalizeHeader(header: string) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferColumns(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => normalizeHeader(h));
  const originalByNormalized = new Map<string, string>();
  headers.forEach((h) => originalByNormalized.set(normalizeHeader(h), h));

  const find = (...candidates: string[]) => {
    for (const cand of candidates) {
      const foundIndex = normalized.findIndex((h) => h.includes(cand));
      if (foundIndex !== -1) {
        const orig = headers[foundIndex];
        if (orig) return orig;
      }
    }
    return undefined;
  };

  return {
    date: find('transactiondate', 'postingdate', 'date'),
    description: find('description', 'memo', 'detail', 'name', 'narration'),
    rawDescription: find('rawdescription', 'original', 'full', 'details'),
    amount: find('amount', 'amt', 'value'),
    debit: find('debit', 'withdrawal', 'charge'),
    credit: find('credit', 'deposit', 'payment'),
    checkNumber: find('check', 'cheque'),
  };
}

function computeAmountCents(row: Record<string, string>, columns: ColumnMapping): number | null {
  // Prefer single amount column
  if (columns.amount) {
    const val = row[columns.amount] ?? '';
    const cents = toCents(val);
    if (cents !== null) return cents;
  }

  // Fall back to debit/credit split
  const debitVal = columns.debit ? toCents(row[columns.debit] ?? '') : null;
  const creditVal = columns.credit ? toCents(row[columns.credit] ?? '') : null;

  if (debitVal !== null && creditVal !== null) {
    // If both present on same row, assume one is zero
    if (debitVal !== 0) return -Math.abs(debitVal);
    if (creditVal !== 0) return Math.abs(creditVal);
  }

  if (debitVal !== null) return -Math.abs(debitVal);
  if (creditVal !== null) return Math.abs(creditVal);

  return null;
}

function csvToRecords(buffer: Buffer): Record<string, string>[] {
  return csvTextToRecords(buffer.toString('utf8'));
}

export function parseSpreadsheetStatement(params: {
  fileName: string;
  buffer: Buffer;
  statementType: StatementType;
}) {
  const maxRows = 200_000;
  const rows = csvToRecords(params.buffer);
  if (rows.length > maxRows) {
    throw new Error(`CSV exceeds maximum row limit (${maxRows})`);
  }

  const parsed: ParsedRow[] = [];

  // Infer columns from the first row
  const headerRow = rows[0] ?? {};
  const headers = Object.keys(headerRow);
  const columns = inferColumns(headers);

  for (const row of rows) {
    const date = columns.date ? toDateString(row[columns.date]) : null;
    const description = columns.description ? String(row[columns.description] ?? '').trim() : '';
    const rawDescription = columns.rawDescription
      ? String(row[columns.rawDescription] ?? '').trim()
      : description;
    const amountCents = computeAmountCents(row, columns);
    const checkNumber =
      columns.checkNumber && row[columns.checkNumber] !== undefined
        ? String(row[columns.checkNumber])
        : null;

    if (!date || !description || amountCents === null) {
      continue;
    }

    parsed.push({
      date,
      description,
      rawDescription,
      amountCents,
      checkNumber,
    });
  }

  if (parsed.length === 0) {
    throw new Error('No valid rows found in spreadsheet');
  }

  // Normalize signs based on selected statement type
  const normalized = normalizeTransactionAmountsForStatementType(
    parsed.map((tx) => ({
      description: tx.description,
      rawDescription: tx.rawDescription,
      amountCents: tx.amountCents,
      checkNumber: tx.checkNumber,
      date: tx.date,
    })),
    params.statementType,
  );

  let minDate = normalized[0]?.date;
  let maxDate = normalized[0]?.date;

  for (const tx of normalized) {
    if (!minDate || tx.date < minDate) minDate = tx.date;
    if (!maxDate || tx.date > maxDate) maxDate = tx.date;
  }

  return {
    transactions: normalized,
    statementStartDate: minDate ? new Date(minDate) : undefined,
    statementEndDate: maxDate ? new Date(maxDate) : undefined,
  };
}
