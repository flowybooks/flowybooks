import type { OpeningBalanceInput } from '@/lib/accounting/journal-service';
import { inferCsvDelimiter, parseCsvRows } from '@/lib/utils/csv';

import type { CreateOpeningBalanceForCurrentTeamInput } from './journal-operations';
import {
  parseBalanceEntryLinesFromFormData,
  parseOptionalDate,
  parseRequiredDate,
  parseRowCount,
} from './journal-form-common';

export type OpeningBalanceCsvUpload = {
  asOfDate: Date;
  booksStartDate: Date | null;
  description: string;
  file: File;
};

export function parseOpeningBalanceFormData(
  formData: FormData,
): CreateOpeningBalanceForCurrentTeamInput {
  const asOfDate = parseRequiredDate(
    formData.get('asOfDate'),
    'As-of date is required',
    'Invalid as-of date',
  );
  const booksStartDate = parseOptionalDate(
    formData.get('booksStartDate'),
    'Invalid books start date',
  );
  const descriptionRaw = formData.get('description');
  const description =
    typeof descriptionRaw === 'string' && descriptionRaw.trim()
      ? descriptionRaw.trim()
      : `Opening balance as of ${asOfDate.raw}`;
  const rowCount = parseRowCount(formData.get('rowCount'), 20);
  const lines = parseBalanceEntryLinesFromFormData(formData, rowCount, 'Line');

  if (lines.length === 0) {
    throw new Error('At least one line is required');
  }

  return {
    asOfDate: asOfDate.value,
    booksStartDate,
    description,
    lines,
  };
}

export function parseOpeningBalanceCsvUpload(formData: FormData): OpeningBalanceCsvUpload {
  const asOfDate = parseRequiredDate(
    formData.get('asOfDate'),
    'As-of date is required',
    'Invalid as-of date',
  );
  const booksStartDate = parseOptionalDate(
    formData.get('booksStartDate'),
    'Invalid books start date',
  );
  const descriptionRaw = formData.get('description');
  const description =
    typeof descriptionRaw === 'string' && descriptionRaw.trim()
      ? descriptionRaw.trim()
      : `Opening balance as of ${asOfDate.raw}`;
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw new Error('CSV file is required');
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Only CSV files are supported');
  }

  return {
    asOfDate: asOfDate.value,
    booksStartDate,
    description,
    file,
  };
}

export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseMoneyToCentsFromCsv(value: string, label: string): number {
  const cleaned = value
    .trim()
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[$,]/g, '');

  if (!cleaned) {
    return 0;
  }

  const num = Number(cleaned);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid ${label} amount`);
  }
  if (num < 0) {
    throw new Error(`${label} must be non-negative`);
  }

  return Math.round(num * 100);
}

export function parseOpeningBalanceCsvText(
  text: string,
  accountByCode: Map<string, string>,
): OpeningBalanceInput['lines'] {
  const sanitizedText = text.replace(/^\uFEFF/, '');
  const delimiter = inferCsvDelimiter(sanitizedText.split(/\r?\n/, 1)[0] ?? '');
  const rows = parseCsvRows(sanitizedText, delimiter).filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );

  if (rows.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    throw new Error('CSV must include a header row');
  }
  const normalizedHeaders = headerRow.map((header) => normalizeHeader(header.trim()));
  const findHeader = (...candidates: string[]) => {
    for (const candidate of candidates) {
      const index = normalizedHeaders.findIndex((header) => header === candidate);
      if (index !== -1) {
        return index;
      }
    }
    return -1;
  };

  const accountIndex = findHeader('accountcode', 'code', 'account', 'accountnumber', 'glcode');
  const descriptionIndex = findHeader('description', 'memo', 'narration');
  const debitIndex = findHeader('debit');
  const creditIndex = findHeader('credit');

  if (accountIndex === -1 || (debitIndex === -1 && creditIndex === -1)) {
    throw new Error('CSV must include Account Code and Debit/Credit columns');
  }

  const lines: OpeningBalanceInput['lines'] = [];

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    if (!row) {
      continue;
    }
    const accountCode = (row[accountIndex] ?? '').trim();
    const narration = descriptionIndex !== -1 ? (row[descriptionIndex] ?? '').trim() : '';
    const debit = debitIndex !== -1 ? parseMoneyToCentsFromCsv(row[debitIndex] ?? '', 'debit') : 0;
    const credit =
      creditIndex !== -1 ? parseMoneyToCentsFromCsv(row[creditIndex] ?? '', 'credit') : 0;

    if (!accountCode && debit === 0 && credit === 0 && !narration) {
      continue;
    }

    const accountId = accountByCode.get(accountCode.toLowerCase());
    if (!accountId) {
      throw new Error(`Account code not found: ${accountCode || '(blank)'}`);
    }

    if (debit > 0 && credit > 0) {
      throw new Error(`Row ${i + 2}: only one of debit or credit is allowed`);
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`Row ${i + 2}: debit or credit must be greater than zero`);
    }

    lines.push({
      accountId,
      debit,
      credit,
      narration,
    });
  }

  if (lines.length === 0) {
    throw new Error('At least one line is required');
  }

  return lines;
}
