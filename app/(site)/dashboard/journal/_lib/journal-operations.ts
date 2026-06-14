// This file contains the "business workflow" for journals.
// It talks to auth, the database, and journal services to create, update,
// post, void, and load journal data for the current team.

import { revalidatePath } from 'next/cache';
import { requireTeamRole } from '@/lib/auth/middleware';
import {
  ensureSystemEquityAccounts,
  getAccountsForTeam,
  getJournalBatchesForTeam,
  getJournalBatchForTeam,
  getJournalLinesWithAccounts,
  requireActiveCoa,
  requireTeam,
} from '@/lib/db/queries';
import {
  adjustJournalBatch,
  createDraftJournalBatch,
  createOpeningBalanceBatch,
  createPostedJournalBatch,
  createPriorPeriodAdjustmentBatch,
  deleteDraftJournalBatch,
  postJournalBatch,
  type CreateJournalBatchMeta,
  type CreateJournalLineInput,
  type OpeningBalanceInput,
  type PriorPeriodAdjustmentInput,
  updateDraftJournalBatch,
  voidJournalEntryLifecycle,
} from '@/lib/accounting/journal-service';
import { calculateJournalTotals } from '@/lib/accounting/journals';
import {
  importCsvJournals,
  type CsvJournalLine,
  type CsvJournalStatus,
} from '@/lib/accounting/journal-import';
import {
  buildUserFacingJournalState,
  findRootJournalBatchId,
  getVisibleJournalBatches,
  type UserFacingJournalBatch,
} from './journal-list-state';
import { parseOpeningBalanceCsvText, type OpeningBalanceCsvUpload } from './journal-form-data';

export type CreateJournalForCurrentTeamInput = {
  date: Date;
  description: string;
  lines: CreateJournalLineInput[];
};

export type ImportCsvJournalsForCurrentTeamInput = {
  status?: CsvJournalStatus;
  lines: CsvJournalLine[];
};

export type AdjustJournalForCurrentTeamInput = {
  batchId: string;
  description: string;
  date: Date;
  lines: CreateJournalLineInput[];
  meta?: CreateJournalBatchMeta;
};

export type CreateOpeningBalanceForCurrentTeamInput = Omit<
  OpeningBalanceInput,
  'orgId' | 'createdByUserId'
>;

export type CreatePriorPeriodAdjustmentForCurrentTeamInput = Omit<
  PriorPeriodAdjustmentInput,
  'orgId' | 'createdByUserId'
>;

function revalidateJournalListAndDetail(batchId?: string) {
  revalidatePath('/dashboard/journal');
  if (batchId) {
    revalidatePath(`/dashboard/journal/${batchId}`);
  }
}

function revalidateAccountingReports() {
  revalidatePath('/dashboard/reports');
  revalidatePath('/dashboard/reports/balance-sheet');
  revalidatePath('/dashboard/reports/income-statement');
  revalidatePath('/dashboard/reports/trial-balance');
  revalidatePath('/dashboard/reports/general-ledger');
}

export async function createPostedJournalForCurrentTeam(
  input: CreateJournalForCurrentTeamInput,
): Promise<{ batchId: string }> {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);

  const result = await createPostedJournalBatch({
    orgId: team.id,
    date: input.date,
    description: input.description,
    createdByUserId: user.id,
    lines: input.lines,
  });

  revalidateJournalListAndDetail(result.batchId);
  revalidateAccountingReports();
  return result;
}

export async function listJournalsForCurrentTeam(): Promise<UserFacingJournalBatch[]> {
  const team = await requireTeam();
  const batches = await getJournalBatchesForTeam(team.id);
  return getVisibleJournalBatches(batches);
}

export async function createDraftJournalForCurrentTeam(
  input: CreateJournalForCurrentTeamInput,
): Promise<{ batchId: string }> {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);

  const result = await createDraftJournalBatch({
    orgId: team.id,
    date: input.date,
    description: input.description,
    createdByUserId: user.id,
    lines: input.lines,
  });

  revalidateJournalListAndDetail(result.batchId);
  return result;
}

export async function postJournalForCurrentTeam(batchId: string): Promise<{ batchId: string }> {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);

  const result = await postJournalBatch({
    orgId: team.id,
    batchId,
    postedByUserId: user.id,
  });

  revalidateJournalListAndDetail(batchId);
  revalidateAccountingReports();
  return result;
}

export async function deleteDraftJournalForCurrentTeam(batchId: string): Promise<void> {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  await deleteDraftJournalBatch({
    orgId: team.id,
    batchId,
  });

  revalidatePath('/dashboard/journal');
}

export async function voidJournalForCurrentTeam(batchId: string): Promise<{ batchId: string }> {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  const result = await voidJournalEntryLifecycle({
    orgId: team.id,
    batchId,
    voidedByUserId: user.id,
  });

  revalidateJournalListAndDetail(batchId);
  revalidateAccountingReports();
  return result;
}

export async function getJournalDetailForCurrentTeam(batchId: string) {
  const team = await requireTeam();
  const batches = await getJournalBatchesForTeam(team.id);
  const state = buildUserFacingJournalState(batches);
  const requestedBatch = state.batchById.get(batchId);

  if (!requestedBatch) {
    return null;
  }

  const routeId = findRootJournalBatchId(requestedBatch.id, state.batchById);
  const resolvedBatch = state.latestByRootId.get(routeId);
  if (!resolvedBatch || resolvedBatch.status === 'voided') {
    return null;
  }

  const lines = await getJournalLinesWithAccounts(resolvedBatch.id, team.id);
  const totals = calculateJournalTotals(
    lines.map((line) => ({ debit: line.debit, credit: line.credit })),
  );

  return { batch: resolvedBatch, lines, totals, routeId };
}

export async function importCsvJournalsForCurrentTeam(input: ImportCsvJournalsForCurrentTeamInput) {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);

  return importCsvJournals({
    orgId: team.id,
    createdByUserId: user.id,
    status: input.status ?? 'draft',
    lines: input.lines,
  });
}

export async function adjustJournalForCurrentTeam(input: AdjustJournalForCurrentTeamInput) {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);

  const existing = await getJournalBatchForTeam(team.id, input.batchId);
  if (!existing) {
    throw new Error('Journal not found');
  }

  if (existing.status === 'draft') {
    await updateDraftJournalBatch({
      orgId: team.id,
      batchId: input.batchId,
      userId: user.id,
      draft: {
        description: input.description,
        date: input.date,
        lines: input.lines,
      },
    });

    revalidateJournalListAndDetail(input.batchId);
    return { reversalBatchId: null, revisedBatchId: input.batchId };
  }

  const result = await adjustJournalBatch({
    orgId: team.id,
    batchId: input.batchId,
    userId: user.id,
    revised: {
      description: input.description,
      date: input.date,
      lines: input.lines,
      sourceType: input.meta?.sourceType ?? 'adjustment',
      sourceRef: input.meta?.sourceRef,
    },
  });

  revalidateJournalListAndDetail(input.batchId);
  revalidateJournalListAndDetail(result.revisedBatchId);
  revalidateAccountingReports();
  return result;
}

export async function createOpeningBalanceForCurrentTeam(
  input: CreateOpeningBalanceForCurrentTeamInput,
) {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);
  await ensureSystemEquityAccounts(team.id);

  const result = await createOpeningBalanceBatch({
    ...input,
    orgId: team.id,
    createdByUserId: user.id,
  });

  revalidateJournalListAndDetail(result.batchId);
  revalidateAccountingReports();
  return result;
}

export async function createOpeningBalanceFromCsvUploadForCurrentTeam(
  upload: OpeningBalanceCsvUpload,
) {
  const { team, user } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);
  await ensureSystemEquityAccounts(team.id);

  const accounts = await getAccountsForTeam(team.id);
  const accountByCode = new Map(
    accounts.map((account) => [account.code.toLowerCase(), account.id]),
  );

  const buffer = Buffer.from(await upload.file.arrayBuffer());
  const lines = parseOpeningBalanceCsvText(buffer.toString('utf8'), accountByCode);

  const result = await createOpeningBalanceBatch({
    orgId: team.id,
    createdByUserId: user.id,
    asOfDate: upload.asOfDate,
    booksStartDate: upload.booksStartDate,
    description: upload.description,
    lines,
  });

  revalidateJournalListAndDetail(result.batchId);
  revalidateAccountingReports();
  return result;
}

export async function createPriorPeriodAdjustmentForCurrentTeam(
  input: CreatePriorPeriodAdjustmentForCurrentTeamInput,
) {
  const { user, team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);
  await requireActiveCoa(team.id);
  await ensureSystemEquityAccounts(team.id);

  const result = await createPriorPeriodAdjustmentBatch({
    ...input,
    orgId: team.id,
    createdByUserId: user.id,
  });

  revalidateJournalListAndDetail(result.batchId);
  revalidateAccountingReports();
  return result;
}
