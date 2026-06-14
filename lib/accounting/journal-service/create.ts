// This file handles the basic ways a journal batch gets created.
// It provides small wrappers for making draft or posted journals while
// reusing the shared batch-creation logic from the core service helpers.

import {
  createJournalBatchWithStatus,
  createJournalBatchWithStatusTx,
  type CreateJournalBatchInput,
  type CreateJournalBatchMeta,
  type DbTx,
} from './shared';

export async function createPostedJournalBatch(
  input: CreateJournalBatchInput,
  meta: CreateJournalBatchMeta = {},
): Promise<{ batchId: string }> {
  return createJournalBatchWithStatus(input, 'posted', meta);
}

export async function createPostedJournalBatchTx(
  tx: DbTx,
  input: CreateJournalBatchInput,
  meta: CreateJournalBatchMeta = {},
): Promise<{ batchId: string }> {
  return createJournalBatchWithStatusTx(tx, input, 'posted', meta);
}

export async function createDraftJournalBatch(
  input: CreateJournalBatchInput,
  meta: CreateJournalBatchMeta = {},
): Promise<{ batchId: string }> {
  return createJournalBatchWithStatus(input, 'draft', meta);
}

export async function createDraftJournalBatchTx(
  tx: DbTx,
  input: CreateJournalBatchInput,
  meta: CreateJournalBatchMeta = {},
): Promise<{ batchId: string }> {
  return createJournalBatchWithStatusTx(tx, input, 'draft', meta);
}
