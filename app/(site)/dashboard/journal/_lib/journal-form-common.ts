import type { CreateJournalLineInput, OpeningBalanceInput } from '@/lib/accounting/journal-service';
import { parseIsoDateParam } from '@/lib/utils/iso-date';

type MonetaryField = 'debit' | 'credit';

export function parseRequiredString(raw: FormDataEntryValue | null, message: string): string {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw new Error(message);
  }

  return raw.trim();
}

export function parseDateInputValue(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const invalidFallback = new Date(0);
  const isoParsed = parseIsoDateParam(trimmed, invalidFallback);
  if (isoParsed !== invalidFallback) {
    return isoParsed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function parseRequiredDate(
  raw: FormDataEntryValue | null,
  requiredMessage: string,
  invalidMessage: string,
): { raw: string; value: Date } {
  const rawValue = parseRequiredString(raw, requiredMessage);
  const parsed = parseDateInputValue(rawValue);

  if (!parsed) {
    throw new Error(invalidMessage);
  }

  return {
    raw: rawValue,
    value: parsed,
  };
}

export function parseOptionalDate(
  raw: FormDataEntryValue | null,
  invalidMessage: string,
): Date | null {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return null;
  }

  const parsed = parseDateInputValue(raw);
  if (!parsed) {
    throw new Error(invalidMessage);
  }

  return parsed;
}

export function parseMoneyToCents(
  raw: FormDataEntryValue | null,
  lineIndex: number,
  field: MonetaryField,
): number {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return 0;
  }

  const num = Number(raw);
  if (Number.isNaN(num)) {
    throw new Error(`Line ${lineIndex + 1}: ${field} must be a valid number`);
  }

  const cents = Math.round(num * 100);
  if (cents < 0) {
    throw new Error(`Line ${lineIndex + 1}: ${field} must be non-negative`);
  }

  return cents;
}

export function parseRowCount(raw: FormDataEntryValue | null, fallback: number): number {
  const num = raw ? Number(raw) : fallback;
  if (Number.isNaN(num) || num <= 0) {
    return fallback;
  }

  return Math.min(num, 200);
}

export function getJournalLineRowCount(formData: FormData, fallbackRowCount: number): number {
  let maxRowIndex = -1;
  const fieldPrefixes = ['accountId_', 'lineDescription_', 'lineGlDate_', 'debit_', 'credit_'];

  for (const key of formData.keys()) {
    const prefix = fieldPrefixes.find((value) => key.startsWith(value));
    if (!prefix) {
      continue;
    }

    const indexValue = Number.parseInt(key.slice(prefix.length), 10);
    if (Number.isInteger(indexValue) && indexValue > maxRowIndex) {
      maxRowIndex = indexValue;
    }
  }

  return Math.max(maxRowIndex + 1, fallbackRowCount);
}

export function formatGlDateKey(dateKey: string): string {
  const parsed = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateKey;
  }

  return parsed.toLocaleDateString('en-US');
}

export function formatCentsAsCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function getBalanceMessage(lines: CreateJournalLineInput[]): string | null {
  let totalDebit = 0;
  let totalCredit = 0;
  const totalsByDate = new Map<string, { debit: number; credit: number }>();

  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;

    totalDebit += debit > 0 ? debit : 0;
    totalCredit += credit > 0 ? credit : 0;

    const dateKey = line.glDate.toISOString().slice(0, 10);
    const current = totalsByDate.get(dateKey) ?? { debit: 0, credit: 0 };
    current.debit += debit > 0 ? debit : 0;
    current.credit += credit > 0 ? credit : 0;
    totalsByDate.set(dateKey, current);
  }

  const unbalancedDates = Array.from(totalsByDate.entries())
    .filter(([, totals]) => totals.debit !== totals.credit)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, totals]) => {
      const difference = Math.abs(totals.debit - totals.credit);
      return `${formatGlDateKey(dateKey)}: Debits ${formatCentsAsCurrency(
        totals.debit,
      )}, Credits ${formatCentsAsCurrency(
        totals.credit,
      )} (difference: ${formatCentsAsCurrency(difference)})`;
    });

  if (unbalancedDates.length > 0) {
    if (unbalancedDates.length === 1) {
      return `Out of balance on ${unbalancedDates[0]}`;
    }

    return `Out of balance on ${unbalancedDates.length} dates: ${unbalancedDates.join('; ')}`;
  }

  if (totalDebit !== totalCredit) {
    const firstDateKey = lines[0]?.glDate.toISOString().slice(0, 10) ?? 'unknown date';
    const difference = Math.abs(totalDebit - totalCredit);
    return `Out of balance on ${formatGlDateKey(firstDateKey)}: Debits ${formatCentsAsCurrency(
      totalDebit,
    )}, Credits ${formatCentsAsCurrency(
      totalCredit,
    )} (difference: ${formatCentsAsCurrency(difference)})`;
  }

  return null;
}

export function parseJournalLinesFromFormData(
  formData: FormData,
  rowCount: number,
): CreateJournalLineInput[] {
  const lines: CreateJournalLineInput[] = [];

  for (let i = 0; i < rowCount; i++) {
    const accountId = formData.get(`accountId_${i}`);
    const lineDescription = formData.get(`lineDescription_${i}`);
    const lineGlDateRaw = formData.get(`lineGlDate_${i}`);
    const debitRaw = formData.get(`debit_${i}`);
    const creditRaw = formData.get(`credit_${i}`);

    const accountIdStr = accountId && typeof accountId === 'string' ? accountId.trim() : '';
    const descriptionStr =
      lineDescription && typeof lineDescription === 'string' ? lineDescription.trim() : '';
    const debitStr = debitRaw && typeof debitRaw === 'string' ? debitRaw.trim() : '';
    const creditStr = creditRaw && typeof creditRaw === 'string' ? creditRaw.trim() : '';

    const hasAnyValue =
      accountIdStr || debitStr.length > 0 || creditStr.length > 0 || descriptionStr;

    if (!hasAnyValue) {
      continue;
    }

    if (!accountIdStr) {
      throw new Error(`Line ${i + 1}: account is required for non-empty line`);
    }

    let lineDate: Date | null = null;
    if (lineGlDateRaw && typeof lineGlDateRaw === 'string' && lineGlDateRaw.trim()) {
      const parsed = parseDateInputValue(lineGlDateRaw);
      if (!parsed) {
        throw new Error(`Line ${i + 1}: invalid GL date "${lineGlDateRaw}"`);
      }
      lineDate = parsed;
    } else {
      throw new Error(`Line ${i + 1}: GL date is required for non-empty line`);
    }

    const debitNumber = debitStr ? Number(debitStr) : 0;
    const creditNumber = creditStr ? Number(creditStr) : 0;

    if (Number.isNaN(debitNumber) || Number.isNaN(creditNumber)) {
      throw new Error(`Line ${i + 1}: debit and credit must be valid numbers`);
    }

    lines.push({
      accountId: accountIdStr,
      glDate: lineDate,
      debit: Math.round(debitNumber * 100),
      credit: Math.round(creditNumber * 100),
      narration: descriptionStr,
    });
  }

  return lines;
}

export function parseBalanceEntryLinesFromFormData(
  formData: FormData,
  rowCount: number,
  labelPrefix: 'Line' | 'Row',
): OpeningBalanceInput['lines'] {
  const lines: OpeningBalanceInput['lines'] = [];

  for (let i = 0; i < rowCount; i++) {
    const accountId = formData.get(`accountId_${i}`);
    const narration = formData.get(`lineDescription_${i}`);
    const debit = parseMoneyToCents(formData.get(`debit_${i}`), i, 'debit');
    const credit = parseMoneyToCents(formData.get(`credit_${i}`), i, 'credit');

    const accountIdStr = accountId && typeof accountId === 'string' ? accountId.trim() : '';
    const narrationStr = narration && typeof narration === 'string' ? narration.trim() : '';

    const hasValue = accountIdStr || debit > 0 || credit > 0 || narrationStr.length > 0;

    if (!hasValue) {
      continue;
    }

    if (!accountIdStr) {
      throw new Error(`${labelPrefix} ${i + 1}: account is required`);
    }

    if (debit > 0 && credit > 0) {
      throw new Error(`${labelPrefix} ${i + 1}: only one of debit or credit is allowed`);
    }
    if (debit === 0 && credit === 0) {
      throw new Error(`${labelPrefix} ${i + 1}: debit or credit must be greater than zero`);
    }

    lines.push({
      accountId: accountIdStr,
      debit,
      credit,
      narration: narrationStr,
    });
  }

  return lines;
}
