import 'server-only';

import { createTimeMachineSnapshot } from '@/lib/accounting/time-machine-service';
import {
  createDraftJournalBatch,
  createPostedJournalBatch,
  type CreateJournalLineInput,
} from '@/lib/accounting/journal-service';
import { db } from '@/lib/db/drizzle';
import { kevinActions } from '@/lib/db/schema';

import { KEVIN_ACTION_STATUSES, KEVIN_ACTION_TYPES } from './action-contracts';
import { getAccountsForKevin, type KevinAccountContext } from './context-service';
import { parseKevinAccountingDate } from './format';
import { KevinJournalProposalSchema, type KevinJournalProposal } from './schemas';
import { storeMessage } from './thread-repository';
import type { KevinActionResult } from './types';

type AccountContext = KevinAccountContext;

function proposalToLines(
  proposal: KevinJournalProposal,
  accountsForOrg: AccountContext,
): CreateJournalLineInput[] {
  const accountByCode = new Map(accountsForOrg.map((account) => [account.code, account]));

  return proposal.lines.map((line, index) => {
    const account = accountByCode.get(line.accountCode);
    if (!account) {
      throw new Error(
        `Kevin proposed unknown account code on line ${index + 1}: ${line.accountCode}`,
      );
    }
    if (!account.isActive) {
      throw new Error(`Kevin proposed inactive account ${line.accountCode}`);
    }

    return {
      accountId: account.id,
      glDate: parseKevinAccountingDate(proposal.date),
      debit: line.debitCents,
      credit: line.creditCents,
      narration: line.memo ?? proposal.description,
      sourceType: 'kevin',
      sourceRef: {
        proposedAccountCode: line.accountCode,
        proposedAccountName: line.accountName ?? account.name,
      },
    };
  });
}

export async function createKevinJournalFromProposal(params: {
  orgId: number;
  userId: number;
  threadId: string | null;
  proposal: KevinJournalProposal;
  status: 'draft' | 'posted';
  sourceType?: 'kevin_draft' | 'kevin_post' | 'kevin_redo';
  actionType?: 'draft_journal' | 'post_journal' | 'redo_journal';
  auditNote?: string;
  redoOfActionId?: string;
}): Promise<KevinActionResult> {
  const proposal = KevinJournalProposalSchema.parse(params.proposal);
  const accountsForOrg = await getAccountsForKevin(params.orgId);
  const lines = proposalToLines(proposal, accountsForOrg);
  const sourceType =
    params.sourceType ?? (params.status === 'posted' ? 'kevin_post' : 'kevin_draft');
  const actionType =
    params.actionType ??
    (params.status === 'posted' ? KEVIN_ACTION_TYPES.postJournal : KEVIN_ACTION_TYPES.draftJournal);
  const sourceRef = {
    kind: 'kevin_journal',
    proposal,
    requestedStatus: params.status,
    sourceType,
    createdAt: new Date().toISOString(),
  };

  const preSnapshot = await createTimeMachineSnapshot({
    orgId: params.orgId,
    userId: params.userId,
    label: `Before Kevin ${params.status === 'posted' ? 'posted' : 'drafted'} journal`,
    description: proposal.description,
    reason: 'kevin_action',
    sourceType: actionType,
    sourceId: params.threadId,
  });

  const result =
    params.status === 'posted'
      ? await createPostedJournalBatch(
          {
            orgId: params.orgId,
            date: parseKevinAccountingDate(proposal.date),
            description: proposal.description,
            createdByUserId: params.userId,
            lines,
          },
          {
            sourceType,
            sourceRef,
            auditNote: params.auditNote ?? 'Kevin posted journal',
          },
        )
      : await createDraftJournalBatch(
          {
            orgId: params.orgId,
            date: parseKevinAccountingDate(proposal.date),
            description: proposal.description,
            createdByUserId: params.userId,
            lines,
          },
          {
            sourceType,
            sourceRef,
            auditNote: params.auditNote ?? 'Kevin drafted journal',
          },
        );

  const [action] = await db
    .insert(kevinActions)
    .values({
      orgId: params.orgId,
      threadId: params.threadId,
      userId: params.userId,
      actionType,
      status:
        params.status === 'posted' ? KEVIN_ACTION_STATUSES.posted : KEVIN_ACTION_STATUSES.drafted,
      payload: { proposal },
      result: { journalBatchId: result.batchId, preSnapshotId: preSnapshot.snapshotId },
      journalBatchId: result.batchId,
      redoOfActionId: params.redoOfActionId,
    })
    .returning();
  if (!action) {
    throw new Error('Failed to record Kevin journal action');
  }

  const actionResult = {
    actionId: action.id,
    actionType: action.actionType,
    status: action.status,
    journalBatchId: action.journalBatchId,
  };

  if (params.threadId) {
    await storeMessage({
      orgId: params.orgId,
      threadId: params.threadId,
      role: 'assistant',
      content:
        params.status === 'posted'
          ? 'I posted the confirmed journal entry.'
          : 'I created a draft journal entry.',
      metadata: { action: actionResult },
    });
  }

  return actionResult;
}
