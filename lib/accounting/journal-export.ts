import type { CsvJournalLine } from '@/lib/accounting/journal-import';

export type JournalCsvRow = CsvJournalLine;

function neutralizeCsvFormula(value: string): string {
  if (/^\s*[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function csvEscape(value: string | number | Date | undefined): string {
  if (value === undefined || value === null) {
    return '';
  }

  const str =
    value instanceof Date
      ? value.toISOString().slice(0, 10) // YYYY-MM-DD
      : typeof value === 'string'
        ? neutralizeCsvFormula(value)
        : String(value);

  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function toJournalCsv(rows: JournalCsvRow[]): string {
  const header = 'GLDate,Narration,Description,GLAccount,Debit,Credit,Tag1,Tag2,Tag3,Tag4,Tag5';

  const lines = rows.map((row) => {
    // Debit/Credit are in dollars for CSV; round to 2 decimals.
    const debitStr = typeof row.debit === 'number' ? row.debit.toFixed(2) : String(row.debit);
    const creditStr = typeof row.credit === 'number' ? row.credit.toFixed(2) : String(row.credit);

    return [
      csvEscape(row.glDate),
      csvEscape(row.narration),
      csvEscape(row.description),
      csvEscape(row.glAccount),
      debitStr,
      creditStr,
      csvEscape(row.tag1),
      csvEscape(row.tag2),
      csvEscape(row.tag3),
      csvEscape(row.tag4),
      csvEscape(row.tag5),
    ].join(',');
  });

  return [header, ...lines].join('\n');
}
