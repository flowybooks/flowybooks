import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';

import { restoreTimeMachineSnapshot } from '@/lib/accounting/time-machine-service';
import { db } from '@/lib/db/drizzle';
import { accounts, journalLines, kevinActions } from '@/lib/db/schema';

import { KEVIN_ACTION_STATUSES, KEVIN_ACTION_TYPES } from './action-contracts';
import { centsToDisplay } from './format';
import type { KevinActionResult } from './types';

function canUndoKevinAction(action: { actionType: string; status: string }) {
  return (
    [
      KEVIN_ACTION_TYPES.draftJournal,
      KEVIN_ACTION_TYPES.postJournal,
      KEVIN_ACTION_TYPES.addAccounts,
      'redo_accounts',
    ].includes(action.actionType) && action.status !== KEVIN_ACTION_STATUSES.undone
  );
}

function canRedoKevinAction(action: { actionType: string; status: string }) {
  return action.status === 'undone' && action.actionType.startsWith('undo_');
}

export async function findLatestKevinActionForOperation(orgId: number, operation: 'undo' | 'redo') {
  const rows = await db
    .select({
      id: kevinActions.id,
      actionType: kevinActions.actionType,
      status: kevinActions.status,
    })
    .from(kevinActions)
    .where(eq(kevinActions.orgId, orgId))
    .orderBy(desc(kevinActions.createdAt))
    .limit(24);

  return (
    rows.find((action) =>
      operation === 'undo' ? canUndoKevinAction(action) : canRedoKevinAction(action),
    ) ?? null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPreActionSnapshotId(result: unknown): string | null {
  if (!isRecord(result)) return null;
  return typeof result.preSnapshotId === 'string' ? result.preSnapshotId : null;
}

export async function listKevinActions(orgId: number): Promise<KevinActionResult[]> {
  const rows = await db
    .select({
      id: kevinActions.id,
      actionType: kevinActions.actionType,
      status: kevinActions.status,
      journalBatchId: kevinActions.journalBatchId,
    })
    .from(kevinActions)
    .where(eq(kevinActions.orgId, orgId))
    .orderBy(desc(kevinActions.createdAt))
    .limit(12);

  return rows.map((row) => ({
    actionId: row.id,
    actionType: row.actionType,
    status: row.status,
    journalBatchId: row.journalBatchId,
  }));
}

export async function undoKevinAction(params: {
  orgId: number;
  userId: number;
  actionId: string;
}): Promise<KevinActionResult> {
  const [action] = await db
    .select()
    .from(kevinActions)
    .where(and(eq(kevinActions.orgId, params.orgId), eq(kevinActions.id, params.actionId)))
    .limit(1);

  if (!action) {
    throw new Error('Kevin action not found');
  }

  const snapshotId = readPreActionSnapshotId(action.result);
  if (!snapshotId) {
    throw new Error(
      'This Kevin action does not have a pre-action Time Machine checkpoint. Open Time Machine to inspect available checkpoints.',
    );
  }

  await restoreTimeMachineSnapshot({
    orgId: params.orgId,
    userId: params.userId,
    snapshotId,
  });

  return {
    actionId: action.id,
    actionType: KEVIN_ACTION_TYPES.timeMachineRestore,
    status: KEVIN_ACTION_STATUSES.restored,
    journalBatchId: null,
  };
}

export async function redoKevinAction(params: {
  orgId: number;
  userId: number;
  actionId: string;
}): Promise<KevinActionResult> {
  const [action] = await db
    .select()
    .from(kevinActions)
    .where(and(eq(kevinActions.orgId, params.orgId), eq(kevinActions.id, params.actionId)))
    .limit(1);

  if (!action) {
    throw new Error('Kevin action not found');
  }

  void params.userId;
  throw new Error(
    'Kevin redo uses Time Machine safety checkpoints. Open Time Machine and restore the safety checkpoint captured before the undo.',
  );
}

export async function getKevinJournalLinesForActions(orgId: number, actionIds: string[]) {
  if (actionIds.length === 0) return [];

  const rows = await db
    .select({
      actionId: kevinActions.id,
      batchId: journalLines.batchId,
      glDate: journalLines.glDate,
      narration: journalLines.narration,
      debit: journalLines.debit,
      credit: journalLines.credit,
      accountCode: accounts.code,
      accountName: accounts.name,
    })
    .from(kevinActions)
    .innerJoin(journalLines, eq(kevinActions.journalBatchId, journalLines.batchId))
    .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
    .where(and(eq(kevinActions.orgId, orgId), inArray(kevinActions.id, actionIds)));

  return rows.map((row) => ({
    ...row,
    amount: row.debit ? centsToDisplay(row.debit) : centsToDisplay(row.credit),
  }));
}
