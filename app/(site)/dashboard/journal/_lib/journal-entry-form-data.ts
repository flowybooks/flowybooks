import type {
  AdjustJournalForCurrentTeamInput,
  CreateJournalForCurrentTeamInput,
} from './journal-operations';
import {
  getBalanceMessage,
  getJournalLineRowCount,
  parseJournalLinesFromFormData,
  parseRequiredString,
  parseRowCount,
} from './journal-form-common';

export type ParsedAdjustJournalFormData = {
  batchId: string;
  returnToJournalId: string | null;
  input: AdjustJournalForCurrentTeamInput;
};

export function parseCreateDraftJournalFormData(
  formData: FormData,
): CreateJournalForCurrentTeamInput {
  const description = parseRequiredString(formData.get('narration'), 'Narration is required');
  const rowCount = parseRowCount(formData.get('rowCount'), 20);
  const lines = parseJournalLinesFromFormData(formData, rowCount);

  if (lines.length === 0) {
    throw new Error('At least one journal line is required');
  }

  const balanceMessage = getBalanceMessage(lines);
  if (balanceMessage) {
    throw new Error(balanceMessage);
  }

  const date = lines.reduce((min, line) => {
    return line.glDate < min ? line.glDate : min;
  }, lines[0]!.glDate);

  return {
    date,
    description,
    lines,
  };
}

export function parseAdjustJournalFormData(formData: FormData): ParsedAdjustJournalFormData {
  const batchId = parseRequiredString(formData.get('batchId'), 'Missing batchId');
  const returnToJournalIdRaw = formData.get('returnToJournalId');
  const returnToJournalId =
    returnToJournalIdRaw && typeof returnToJournalIdRaw === 'string' && returnToJournalIdRaw.trim()
      ? returnToJournalIdRaw.trim()
      : null;
  const description = parseRequiredString(formData.get('narration'), 'Narration is required');
  const rowCount = getJournalLineRowCount(formData, 30);
  const lines = parseJournalLinesFromFormData(formData, rowCount);

  if (lines.length === 0) {
    throw new Error('At least one journal line is required');
  }

  const balanceMessage = getBalanceMessage(lines);
  if (balanceMessage) {
    throw new Error(balanceMessage);
  }

  const date = lines.reduce((min, line) => {
    return line.glDate < min ? line.glDate : min;
  }, lines[0]!.glDate);

  return {
    batchId,
    returnToJournalId,
    input: {
      batchId,
      description,
      date,
      lines,
      meta: { sourceType: 'adjustment' },
    },
  };
}
