'use server';

// This file is the main entry point for journal-related server actions.
// It keeps the Next.js form actions in one place, then hands the real work
// off to smaller helper files so this file stays easier to read.

import { redirect } from 'next/navigation';
import {
  adjustJournalForCurrentTeam,
  createDraftJournalForCurrentTeam,
  createOpeningBalanceForCurrentTeam,
  createOpeningBalanceFromCsvUploadForCurrentTeam,
  createPostedJournalForCurrentTeam,
  createPriorPeriodAdjustmentForCurrentTeam,
  deleteDraftJournalForCurrentTeam,
  getJournalDetailForCurrentTeam,
  importCsvJournalsForCurrentTeam,
  listJournalsForCurrentTeam,
  postJournalForCurrentTeam,
  voidJournalForCurrentTeam,
} from './_lib/journal-operations';
import {
  parseAdjustJournalFormData,
  parseCreateDraftJournalFormData,
  parseOpeningBalanceCsvUpload,
  parseOpeningBalanceFormData,
  parsePriorPeriodAdjustmentFormData,
} from './_lib/journal-form-data';

export {
  adjustJournalForCurrentTeam,
  createOpeningBalanceForCurrentTeam,
  createPostedJournalForCurrentTeam,
  createPriorPeriodAdjustmentForCurrentTeam,
  getJournalDetailForCurrentTeam,
  importCsvJournalsForCurrentTeam,
  listJournalsForCurrentTeam,
};

export async function postJournalFromForm(formData: FormData) {
  const batchId = formData.get('batchId');

  if (!batchId || typeof batchId !== 'string') {
    throw new Error('Missing batchId');
  }

  await postJournalForCurrentTeam(batchId);
  redirect(`/dashboard/journal/${batchId}`);
}

export async function deleteJournalFromForm(formData: FormData) {
  const batchId = formData.get('batchId');

  if (!batchId || typeof batchId !== 'string') {
    throw new Error('Missing batchId');
  }

  await deleteDraftJournalForCurrentTeam(batchId);
  redirect('/dashboard/journal');
}

export async function voidJournalFromForm(formData: FormData) {
  const batchId = formData.get('batchId');

  if (!batchId || typeof batchId !== 'string') {
    throw new Error('Missing batchId');
  }

  await voidJournalForCurrentTeam(batchId);
  redirect('/dashboard/journal');
}

export async function createDraftJournalFromForm(formData: FormData) {
  let batchId = '';

  try {
    const result = await createDraftJournalForCurrentTeam(
      parseCreateDraftJournalFormData(formData),
    );
    batchId = result.batchId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to save journal entry';
    redirect(`/dashboard/journal/new?error=${encodeURIComponent(message)}`);
  }

  redirect(`/dashboard/journal/${batchId}`);
}

export async function adjustJournalFromForm(formData: FormData) {
  const batchIdRaw = formData.get('batchId');
  const batchId = typeof batchIdRaw === 'string' && batchIdRaw.trim() ? batchIdRaw.trim() : '';
  const returnToJournalIdRaw = formData.get('returnToJournalId');
  const returnToJournalId =
    returnToJournalIdRaw && typeof returnToJournalIdRaw === 'string' && returnToJournalIdRaw.trim()
      ? returnToJournalIdRaw.trim()
      : null;

  let revisedBatchId = '';

  try {
    const parsed = parseAdjustJournalFormData(formData);
    const result = await adjustJournalForCurrentTeam(parsed.input);
    revisedBatchId = result.revisedBatchId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to save journal changes';
    redirect(
      `/dashboard/journal/${returnToJournalId ?? batchId}/edit?error=${encodeURIComponent(message)}`,
    );
  }

  redirect(`/dashboard/journal/${returnToJournalId ?? revisedBatchId}`);
}

export async function createOpeningBalanceFromForm(formData: FormData) {
  let batchId = '';

  try {
    const result = await createOpeningBalanceForCurrentTeam(parseOpeningBalanceFormData(formData));
    batchId = result.batchId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to create opening balance';
    redirect(`/dashboard/journal/opening-balance?error=${encodeURIComponent(message)}`);
  }

  redirect(`/dashboard/journal/${batchId}`);
}

export async function createOpeningBalanceFromCsv(formData: FormData) {
  let batchId = '';

  try {
    const result = await createOpeningBalanceFromCsvUploadForCurrentTeam(
      parseOpeningBalanceCsvUpload(formData),
    );
    batchId = result.batchId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to create opening balance';
    redirect(`/dashboard/journal/opening-balance?error=${encodeURIComponent(message)}`);
  }

  redirect(`/dashboard/journal/${batchId}`);
}

export async function createPriorPeriodAdjustmentFromForm(formData: FormData) {
  const { batchId } = await createPriorPeriodAdjustmentForCurrentTeam(
    parsePriorPeriodAdjustmentFormData(formData),
  );

  redirect(`/dashboard/journal/${batchId}`);
}
