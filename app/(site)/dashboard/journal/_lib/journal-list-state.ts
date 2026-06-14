// This file figures out which journal batches should be shown to the user.
// It hides internal/replaced versions and picks the latest visible journal
// so the journal list matches the accounting workflow more clearly.

import type { getJournalBatchesForTeam } from '@/lib/db/queries';

type JournalBatchRow = Awaited<ReturnType<typeof getJournalBatchesForTeam>>[number];

export type UserFacingJournalBatch = JournalBatchRow & {
  routeId: string;
};

const INTERNAL_JOURNAL_SOURCE_TYPES = new Set(['adjustment_reversal']);

function isInternalJournalBatch(batch: JournalBatchRow): boolean {
  return batch.sourceType ? INTERNAL_JOURNAL_SOURCE_TYPES.has(batch.sourceType) : false;
}

export function compareJournalBatchesByRecency(
  left: Pick<JournalBatchRow, 'updatedAt' | 'date' | 'id'>,
  right: Pick<JournalBatchRow, 'updatedAt' | 'date' | 'id'>,
): number {
  const updatedAtDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }

  const dateDelta = right.date.getTime() - left.date.getTime();
  if (dateDelta !== 0) {
    return dateDelta;
  }

  return right.id.localeCompare(left.id);
}

function buildJournalChildrenMap(batches: JournalBatchRow[]): Map<string, JournalBatchRow[]> {
  const childrenBySupersededId = new Map<string, JournalBatchRow[]>();

  for (const batch of batches) {
    if (!batch.supersedesBatchId) {
      continue;
    }

    const children = childrenBySupersededId.get(batch.supersedesBatchId) ?? [];
    children.push(batch);
    childrenBySupersededId.set(batch.supersedesBatchId, children);
  }

  return childrenBySupersededId;
}

export function findRootJournalBatchId(
  batchId: string,
  batchById: Map<string, JournalBatchRow>,
): string {
  let currentId = batchId;
  const visitedIds = new Set<string>();

  while (true) {
    if (visitedIds.has(currentId)) {
      return currentId;
    }

    visitedIds.add(currentId);
    const currentBatch = batchById.get(currentId);

    if (!currentBatch?.supersedesBatchId) {
      return currentId;
    }

    currentId = currentBatch.supersedesBatchId;
  }
}

function findLatestBatchForRoot(
  rootId: string,
  batchById: Map<string, JournalBatchRow>,
  childrenBySupersededId: Map<string, JournalBatchRow[]>,
): JournalBatchRow | null {
  const rootBatch = batchById.get(rootId);
  if (!rootBatch || isInternalJournalBatch(rootBatch)) {
    return null;
  }

  let currentBatch = rootBatch;
  const visitedIds = new Set<string>([currentBatch.id]);

  while (true) {
    const candidates = (childrenBySupersededId.get(currentBatch.id) ?? [])
      .filter((batch) => !isInternalJournalBatch(batch) && batch.status !== 'voided')
      .sort(compareJournalBatchesByRecency);

    if (candidates.length === 0) {
      return currentBatch;
    }

    const nextBatch = candidates[0];
    if (!nextBatch) {
      return currentBatch;
    }
    if (visitedIds.has(nextBatch.id)) {
      return currentBatch;
    }

    visitedIds.add(nextBatch.id);
    currentBatch = nextBatch;
  }
}

export function buildUserFacingJournalState(batches: JournalBatchRow[]) {
  const nonInternalBatches = batches.filter((batch) => !isInternalJournalBatch(batch));
  const batchById = new Map(nonInternalBatches.map((batch) => [batch.id, batch]));
  const childrenBySupersededId = buildJournalChildrenMap(nonInternalBatches);
  const latestByRootId = new Map<string, JournalBatchRow>();

  for (const batch of nonInternalBatches) {
    const rootId = findRootJournalBatchId(batch.id, batchById);
    if (latestByRootId.has(rootId)) {
      continue;
    }

    const latestBatch = findLatestBatchForRoot(rootId, batchById, childrenBySupersededId);
    if (latestBatch) {
      latestByRootId.set(rootId, latestBatch);
    }
  }

  return {
    batchById,
    latestByRootId,
  };
}

export function getVisibleJournalBatches(batches: JournalBatchRow[]): UserFacingJournalBatch[] {
  const state = buildUserFacingJournalState(batches);

  return Array.from(state.latestByRootId.entries())
    .filter(([, batch]) => batch.status !== 'voided')
    .map(([routeId, batch]) => ({
      ...batch,
      routeId,
    }))
    .sort(compareJournalBatchesByRecency);
}
