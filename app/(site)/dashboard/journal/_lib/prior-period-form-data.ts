import type { PriorPeriodAdjustmentInput } from '@/lib/accounting/journal-service';

import type { CreatePriorPeriodAdjustmentForCurrentTeamInput } from './journal-operations';
import {
  parseBalanceEntryLinesFromFormData,
  parseRequiredDate,
  parseRowCount,
} from './journal-form-common';

export function parsePriorPeriodAdjustmentFormData(
  formData: FormData,
): CreatePriorPeriodAdjustmentForCurrentTeamInput {
  const asOfDate = parseRequiredDate(
    formData.get('asOfDate'),
    'As-of date is required',
    'Invalid as-of date',
  );
  const descriptionRaw = formData.get('description');
  const reasonRaw = formData.get('reason');
  const description =
    typeof descriptionRaw === 'string' && descriptionRaw.trim()
      ? descriptionRaw.trim()
      : `Prior period adjustment as of ${asOfDate.raw}`;
  const reason = typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim() : '';
  const rowCount = parseRowCount(formData.get('rowCount'), 20);
  const lines = parseBalanceEntryLinesFromFormData(
    formData,
    rowCount,
    'Line',
  ) as PriorPeriodAdjustmentInput['lines'];

  if (lines.length === 0) {
    throw new Error('At least one line is required');
  }

  return {
    asOfDate: asOfDate.value,
    description,
    reason,
    lines,
  };
}
