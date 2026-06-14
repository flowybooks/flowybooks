// This file owns deterministic org-scoped Time Machine checkpoints.
// Restore operations replace mutable bookkeeping/workflow rows from a saved
// payload; audit, users, memberships, and snapshots themselves are preserved.

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  accountMappingRules,
  accounts,
  journalBatches,
  journalLines,
  kevinActions,
  kevinDocumentChunks,
  kevinDocuments,
  kevinMemories,
  kevinMessages,
  kevinThreads,
  orgSettings,
  parsedTransactions,
  statementImports,
  timeMachineSnapshots,
  type NewAccount,
  type NewAccountMappingRule,
  type NewJournalBatch,
  type NewJournalLine,
  type NewKevinAction,
  type NewKevinDocument,
  type NewKevinDocumentChunk,
  type NewKevinMemory,
  type NewKevinMessage,
  type NewKevinThread,
  type NewOrgSetting,
  type NewParsedTransaction,
  type NewStatementImport,
  type TimeMachineSnapshotPayload,
} from '@/lib/db/schema';

type SnapshotRow = Record<string, unknown>;
type SnapshotTableKey = keyof TimeMachineSnapshotPayload['tables'];
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const SNAPSHOT_VERSION = 1;

const DATE_KEYS: Record<SnapshotTableKey, string[]> = {
  orgSettings: ['booksStartDate', 'createdAt', 'updatedAt'],
  accounts: ['createdAt', 'updatedAt'],
  journalBatches: ['date', 'createdAt', 'updatedAt'],
  journalLines: ['glDate'],
  statementImports: ['statementStartDate', 'statementEndDate', 'createdAt', 'updatedAt'],
  parsedTransactions: ['transactionDate', 'createdAt', 'updatedAt'],
  accountMappingRules: ['createdAt', 'updatedAt'],
  kevinThreads: ['createdAt', 'updatedAt'],
  kevinMessages: ['createdAt'],
  kevinMemories: ['createdAt', 'updatedAt'],
  kevinActions: ['createdAt', 'updatedAt'],
  kevinDocuments: ['createdAt', 'updatedAt'],
  kevinDocumentChunks: ['createdAt'],
};

export type TimeMachineEntry = {
  entryId: string;
  source: 'snapshot';
  kind: 'checkpoint' | 'restore_safety';
  title: string;
  description: string;
  status: 'available';
  sourceType: string | null;
  sourceId: string | null;
  snapshotId: string;
  createdAt: string;
  updatedAt: string;
  canRestore: boolean;
};

export type TimeMachineActionResult = {
  action: 'snapshot' | 'restore';
  snapshotId: string;
  entryId: string;
  safetySnapshotId?: string;
};

function serializeRows(rows: SnapshotRow[]): SnapshotRow[] {
  return JSON.parse(JSON.stringify(rows)) as SnapshotRow[];
}

function reviveDateValue(value: unknown): Date | null | undefined {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value !== 'string') {
    throw new Error('Snapshot date value is invalid');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Snapshot date value "${value}" is invalid`);
  }
  return date;
}

function restoreRows<TInsert extends { orgId: number }>(
  rows: SnapshotRow[],
  orgId: number,
  tableKey: SnapshotTableKey,
): TInsert[] {
  return rows.map((row) => {
    const restored: SnapshotRow = { ...row, orgId };
    for (const key of DATE_KEYS[tableKey]) {
      if (key in restored) {
        restored[key] = reviveDateValue(restored[key]);
      }
    }
    return restored as TInsert;
  });
}

async function lockTimeMachineOrgTx(tx: DbTx, orgId: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`time_machine:${orgId}`})::bigint)`);
}

async function captureOrgPayload(
  client: typeof db | DbTx,
  orgId: number,
): Promise<TimeMachineSnapshotPayload> {
  const [
    orgSettingRows,
    accountRows,
    journalBatchRows,
    journalLineRows,
    statementImportRows,
    parsedTransactionRows,
    accountMappingRuleRows,
    kevinThreadRows,
    kevinMessageRows,
    kevinMemoryRows,
    kevinActionRows,
    kevinDocumentRows,
    kevinDocumentChunkRows,
  ] = await Promise.all([
    client.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)),
    client.select().from(accounts).where(eq(accounts.orgId, orgId)),
    client.select().from(journalBatches).where(eq(journalBatches.orgId, orgId)),
    client.select().from(journalLines).where(eq(journalLines.orgId, orgId)),
    client.select().from(statementImports).where(eq(statementImports.orgId, orgId)),
    client.select().from(parsedTransactions).where(eq(parsedTransactions.orgId, orgId)),
    client.select().from(accountMappingRules).where(eq(accountMappingRules.orgId, orgId)),
    client.select().from(kevinThreads).where(eq(kevinThreads.orgId, orgId)),
    client.select().from(kevinMessages).where(eq(kevinMessages.orgId, orgId)),
    client.select().from(kevinMemories).where(eq(kevinMemories.orgId, orgId)),
    client.select().from(kevinActions).where(eq(kevinActions.orgId, orgId)),
    client.select().from(kevinDocuments).where(eq(kevinDocuments.orgId, orgId)),
    client.select().from(kevinDocumentChunks).where(eq(kevinDocumentChunks.orgId, orgId)),
  ]);

  return {
    version: SNAPSHOT_VERSION,
    capturedAt: new Date().toISOString(),
    tables: {
      orgSettings: serializeRows(orgSettingRows),
      accounts: serializeRows(accountRows),
      journalBatches: serializeRows(journalBatchRows),
      journalLines: serializeRows(journalLineRows),
      statementImports: serializeRows(statementImportRows),
      parsedTransactions: serializeRows(parsedTransactionRows),
      accountMappingRules: serializeRows(accountMappingRuleRows),
      kevinThreads: serializeRows(kevinThreadRows),
      kevinMessages: serializeRows(kevinMessageRows),
      kevinMemories: serializeRows(kevinMemoryRows),
      kevinActions: serializeRows(kevinActionRows),
      kevinDocuments: serializeRows(kevinDocumentRows),
      kevinDocumentChunks: serializeRows(kevinDocumentChunkRows),
    },
  };
}

function entryFromSnapshot(row: {
  id: string;
  label: string;
  description: string | null;
  reason: string;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: Date;
}): TimeMachineEntry {
  const restoreSafety = row.reason === 'pre_restore';

  return {
    entryId: `snapshot:${row.id}`,
    source: 'snapshot',
    kind: restoreSafety ? 'restore_safety' : 'checkpoint',
    title: row.label,
    description:
      row.description ??
      (restoreSafety
        ? 'Safety checkpoint captured before a restore.'
        : 'Saved database checkpoint.'),
    status: 'available',
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    snapshotId: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
    canRestore: true,
  };
}

export async function createTimeMachineSnapshot(params: {
  orgId: number;
  userId?: number | null;
  label: string;
  description?: string | null;
  reason?: 'manual' | 'kevin_action' | 'app_action' | 'pre_restore';
  sourceType?: string | null;
  sourceId?: string | null;
}): Promise<TimeMachineActionResult> {
  return db.transaction(async (tx) => {
    await lockTimeMachineOrgTx(tx, params.orgId);
    return createTimeMachineSnapshotTx(tx, params);
  });
}

async function createTimeMachineSnapshotTx(
  tx: DbTx,
  params: {
    orgId: number;
    userId?: number | null;
    label: string;
    description?: string | null;
    reason?: 'manual' | 'kevin_action' | 'app_action' | 'pre_restore';
    sourceType?: string | null;
    sourceId?: string | null;
  },
): Promise<TimeMachineActionResult> {
  const payload = await captureOrgPayload(tx, params.orgId);
  const [snapshot] = await tx
    .insert(timeMachineSnapshots)
    .values({
      orgId: params.orgId,
      label: params.label,
      description: params.description ?? null,
      reason: params.reason ?? 'manual',
      sourceType: params.sourceType ?? null,
      sourceId: params.sourceId ?? null,
      payload,
      createdBy: params.userId ?? null,
    })
    .returning({ id: timeMachineSnapshots.id });
  if (!snapshot) {
    throw new Error('Unable to create Time Machine checkpoint.');
  }

  return {
    action: 'snapshot',
    snapshotId: snapshot.id,
    entryId: `snapshot:${snapshot.id}`,
  };
}

export async function listTimeMachineEntries(
  orgId: number,
  limit = 30,
): Promise<TimeMachineEntry[]> {
  const rows = await db
    .select({
      id: timeMachineSnapshots.id,
      label: timeMachineSnapshots.label,
      description: timeMachineSnapshots.description,
      reason: timeMachineSnapshots.reason,
      sourceType: timeMachineSnapshots.sourceType,
      sourceId: timeMachineSnapshots.sourceId,
      createdAt: timeMachineSnapshots.createdAt,
    })
    .from(timeMachineSnapshots)
    .where(eq(timeMachineSnapshots.orgId, orgId))
    .orderBy(desc(timeMachineSnapshots.createdAt))
    .limit(limit);

  return rows.map(entryFromSnapshot);
}

export async function restoreTimeMachineSnapshot(params: {
  orgId: number;
  userId: number;
  snapshotId: string;
}): Promise<TimeMachineActionResult> {
  return db.transaction(async (tx) => {
    await lockTimeMachineOrgTx(tx, params.orgId);

    const [snapshot] = await tx
      .select({
        id: timeMachineSnapshots.id,
        label: timeMachineSnapshots.label,
        payload: timeMachineSnapshots.payload,
      })
      .from(timeMachineSnapshots)
      .where(
        and(
          eq(timeMachineSnapshots.orgId, params.orgId),
          eq(timeMachineSnapshots.id, params.snapshotId),
        ),
      )
      .limit(1);

    if (!snapshot) {
      throw new Error('Time Machine checkpoint not found');
    }

    if (snapshot.payload.version !== SNAPSHOT_VERSION) {
      throw new Error('Time Machine checkpoint version is not supported');
    }

    const safety = await createTimeMachineSnapshotTx(tx, {
      orgId: params.orgId,
      userId: params.userId,
      label: `Before restoring ${snapshot.label}`,
      description: 'Automatically captured so the restore can be reversed.',
      reason: 'pre_restore',
      sourceType: 'time_machine_restore',
      sourceId: snapshot.id,
    });
    const tables = snapshot.payload.tables;

    await tx.delete(kevinDocumentChunks).where(eq(kevinDocumentChunks.orgId, params.orgId));
    await tx.delete(kevinActions).where(eq(kevinActions.orgId, params.orgId));
    await tx.delete(kevinMemories).where(eq(kevinMemories.orgId, params.orgId));
    await tx.delete(kevinMessages).where(eq(kevinMessages.orgId, params.orgId));
    await tx.delete(kevinThreads).where(eq(kevinThreads.orgId, params.orgId));
    await tx.delete(kevinDocuments).where(eq(kevinDocuments.orgId, params.orgId));
    await tx.delete(parsedTransactions).where(eq(parsedTransactions.orgId, params.orgId));
    await tx.delete(statementImports).where(eq(statementImports.orgId, params.orgId));
    await tx.delete(accountMappingRules).where(eq(accountMappingRules.orgId, params.orgId));
    await tx.delete(journalLines).where(eq(journalLines.orgId, params.orgId));
    await tx.delete(journalBatches).where(eq(journalBatches.orgId, params.orgId));
    await tx.delete(accounts).where(eq(accounts.orgId, params.orgId));
    await tx.delete(orgSettings).where(eq(orgSettings.orgId, params.orgId));

    const orgSettingRows = restoreRows<NewOrgSetting>(
      tables.orgSettings,
      params.orgId,
      'orgSettings',
    );
    if (orgSettingRows.length > 0) await tx.insert(orgSettings).values(orgSettingRows);

    const accountRows = restoreRows<NewAccount>(tables.accounts, params.orgId, 'accounts');
    if (accountRows.length > 0) await tx.insert(accounts).values(accountRows);

    const journalBatchRows = restoreRows<NewJournalBatch>(
      tables.journalBatches,
      params.orgId,
      'journalBatches',
    );
    if (journalBatchRows.length > 0) await tx.insert(journalBatches).values(journalBatchRows);

    const journalLineRows = restoreRows<NewJournalLine>(
      tables.journalLines,
      params.orgId,
      'journalLines',
    );
    if (journalLineRows.length > 0) await tx.insert(journalLines).values(journalLineRows);

    const statementImportRows = restoreRows<NewStatementImport>(
      tables.statementImports,
      params.orgId,
      'statementImports',
    );
    if (statementImportRows.length > 0) {
      await tx.insert(statementImports).values(statementImportRows);
    }

    const parsedTransactionRows = restoreRows<NewParsedTransaction>(
      tables.parsedTransactions,
      params.orgId,
      'parsedTransactions',
    );
    if (parsedTransactionRows.length > 0) {
      await tx.insert(parsedTransactions).values(parsedTransactionRows);
    }

    const accountMappingRuleRows = restoreRows<NewAccountMappingRule>(
      tables.accountMappingRules,
      params.orgId,
      'accountMappingRules',
    );
    if (accountMappingRuleRows.length > 0) {
      await tx.insert(accountMappingRules).values(accountMappingRuleRows);
    }

    const kevinThreadRows = restoreRows<NewKevinThread>(
      tables.kevinThreads,
      params.orgId,
      'kevinThreads',
    );
    if (kevinThreadRows.length > 0) await tx.insert(kevinThreads).values(kevinThreadRows);

    const kevinDocumentRows = restoreRows<NewKevinDocument>(
      tables.kevinDocuments,
      params.orgId,
      'kevinDocuments',
    );
    if (kevinDocumentRows.length > 0) {
      await tx.insert(kevinDocuments).values(kevinDocumentRows);
    }

    const kevinMessageRows = restoreRows<NewKevinMessage>(
      tables.kevinMessages,
      params.orgId,
      'kevinMessages',
    );
    if (kevinMessageRows.length > 0) await tx.insert(kevinMessages).values(kevinMessageRows);

    const kevinMemoryRows = restoreRows<NewKevinMemory>(
      tables.kevinMemories,
      params.orgId,
      'kevinMemories',
    );
    if (kevinMemoryRows.length > 0) await tx.insert(kevinMemories).values(kevinMemoryRows);

    const kevinActionRows = restoreRows<NewKevinAction>(
      tables.kevinActions,
      params.orgId,
      'kevinActions',
    );
    if (kevinActionRows.length > 0) {
      await tx.insert(kevinActions).values(
        kevinActionRows.map((action) => ({
          ...action,
          undoOfActionId: null,
          redoOfActionId: null,
        })),
      );

      for (const action of kevinActionRows) {
        if (!action.undoOfActionId && !action.redoOfActionId) continue;
        await tx
          .update(kevinActions)
          .set({
            undoOfActionId: action.undoOfActionId ?? null,
            redoOfActionId: action.redoOfActionId ?? null,
          })
          .where(and(eq(kevinActions.orgId, params.orgId), eq(kevinActions.id, action.id!)));
      }
    }

    const kevinDocumentChunkRows = restoreRows<NewKevinDocumentChunk>(
      tables.kevinDocumentChunks,
      params.orgId,
      'kevinDocumentChunks',
    );
    if (kevinDocumentChunkRows.length > 0) {
      await tx.insert(kevinDocumentChunks).values(kevinDocumentChunkRows);
    }

    return {
      action: 'restore',
      snapshotId: snapshot.id,
      entryId: `snapshot:${snapshot.id}`,
      safetySnapshotId: safety.snapshotId,
    };
  });
}
