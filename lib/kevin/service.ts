// Coordinates Kevin's org-scoped chat, memory, and journal actions.
// All database writes stay server-side and preserve accounting invariants.
import 'server-only';

import {
  applyAccountProposals,
  type ApplyAccountProposalsResult,
} from '@/lib/accounting/account-management-service';
import {
  applyStandardChartOfAccounts,
  type ApplyChartOfAccountsResult,
} from '@/lib/accounting/chart-of-accounts-service';
import { createTimeMachineSnapshot } from '@/lib/accounting/time-machine-service';
import { db } from '@/lib/db/drizzle';
import { kevinActions } from '@/lib/db/schema';

import { KEVIN_ACTION_STATUSES, KEVIN_ACTION_TYPES } from './action-contracts';
import {
  findLatestKevinActionForOperation,
  redoKevinAction,
  undoKevinAction,
} from './action-history-service';
import { extractAuthorityUrls, fetchAuthorityPages } from './authority-service';
import {
  getAccountsForKevin,
  getMemoryContext,
  getRecentJournalContext,
  searchDocumentContext,
} from './context-service';
import {
  requestedKevinHistoryAction,
  shouldAddAccountsFromMessage,
  shouldApplyStandardCoaFromMessage,
} from './intent-router';
import { buildAccountProposalPrompt, buildKevinPrompt } from './prompt-builder';
import {
  KevinAccountProposalSchema,
  KevinResponseSchema,
  type KevinAccountProposal,
  type KevinResponse,
} from './schemas';
import type {
  KevinActionResult,
  KevinAskResult,
  KevinModelTier,
  KevinRuntimeStatus,
} from './types';
import {
  classifyKevinTask,
  getKevinModelForTask,
  getKevinModelForTier,
  type KevinResolvedModel,
  type KevinTaskKind,
} from './model-router';
import { generateStructuredObject, getConfiguredAiProviderDetails } from './model-client';
import { writeMemoryUpdates } from './memory-service';
import { validateKevinResponseAuthority } from './response-label-service';
import {
  ensureThreadExists,
  getOrCreateThread,
  getRecentThreadMessages,
  storeMessage,
} from './thread-repository';

export {
  getKevinJournalLinesForActions,
  listKevinActions,
  redoKevinAction,
  undoKevinAction,
} from './action-history-service';
export { createKevinJournalFromProposal } from './journal-actions-service';
export { getLatestKevinThreadSnapshot } from './thread-repository';

function resolveKevinModel(
  providerDetails: NonNullable<ReturnType<typeof getConfiguredAiProviderDetails>>,
  taskKind: KevinTaskKind,
  preferredModelTier?: KevinModelTier,
) {
  if (preferredModelTier) {
    return getKevinModelForTier(providerDetails, preferredModelTier, taskKind);
  }

  return getKevinModelForTask(providerDetails, taskKind);
}

function getKevinProviderOptions(model: KevinResolvedModel) {
  if (model.provider === 'openai' && model.tier === 'large') {
    return {
      openai: {
        reasoningEffort: 'xhigh',
      },
    };
  }

  return undefined;
}

function fallbackResponse(message: string, setupMessage?: string): KevinResponse {
  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer:
      setupMessage ??
      `Kevin is not configured yet. Set AI_PROVIDER=ollama for local models, or configure a hosted provider explicitly. Your message was: ${message}`,
    citations: [],
    followUpQuestions: [],
    journalProposal: null,
    memoryWrites: [],
  };
}

function standardCoaResponse(result: ApplyChartOfAccountsResult): KevinResponse {
  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer: [
      'I applied the bundled standard chart of accounts to this workspace.',
      `Created ${result.created} account${result.created === 1 ? '' : 's'}, updated ${result.updated} account${result.updated === 1 ? '' : 's'}, and deleted ${result.deleted} account${result.deleted === 1 ? '' : 's'}.`,
      'Protected system accounts and accounts with journal activity were handled through the normal chart-of-accounts import safeguards.',
    ].join(' '),
    citations: [],
    followUpQuestions: [],
    journalProposal: null,
    memoryWrites: [],
  };
}

function kevinHistoryActionResponse(
  operation: 'undo' | 'redo',
  action: KevinActionResult,
): KevinResponse {
  const verb = operation === 'undo' ? 'undid' : 'redid';
  void action;

  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer: `I ${verb} the latest reversible Kevin action by restoring its Time Machine checkpoint. Time Machine captured a safety checkpoint immediately before the restore.`,
    citations: [],
    followUpQuestions: [],
    journalProposal: null,
    memoryWrites: [],
  };
}

function accountProposalNeedsConfigurationResponse(): KevinResponse {
  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer:
      'I can add accounts when AI_PROVIDER is configured so I can infer the account details. Without a model, provide each account name, code, type, and classification in the Chart of Accounts form.',
    citations: [],
    followUpQuestions: [],
    journalProposal: null,
    memoryWrites: [],
  };
}

function accountProposalCouldNotParseResponse(error: unknown): KevinResponse {
  const message = error instanceof Error ? error.message : 'Unknown parsing error';
  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer: `I could not reliably convert that into account additions yet: ${message}. Try naming each account you want added, or include code/type/classification for custom accounts.`,
    citations: [],
    followUpQuestions: [],
    journalProposal: null,
    memoryWrites: [],
  };
}

function accountClarificationResponse(proposal: KevinAccountProposal): KevinResponse {
  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer:
      proposal.clarificationQuestion ??
      'Which account names should I add, and should they be asset, liability, income, expense, or equity accounts?',
    citations: [],
    followUpQuestions: proposal.clarificationQuestion ? [proposal.clarificationQuestion] : [],
    journalProposal: null,
    memoryWrites: [],
  };
}

function accountCreationResponse(result: ApplyAccountProposalsResult): KevinResponse {
  const created =
    result.created.length > 0
      ? `Created ${result.created.map((account) => `${account.code} ${account.name}`).join(', ')}.`
      : 'No new accounts were created.';
  const existing =
    result.existing.length > 0
      ? ` Already present: ${result.existing
          .map((account) => `${account.code} ${account.name}`)
          .join(', ')}.`
      : '';

  return {
    answerLabel: {
      answer_type: 'bookkeeping',
      authority_level: 'educational',
      sources_used: [],
      cannot_answer_from_allowlist: false,
    },
    answer: `${created}${existing}`,
    citations: [],
    followUpQuestions: [],
    journalProposal: null,
    memoryWrites: [],
  };
}

export function getKevinRuntimeStatus(): KevinRuntimeStatus {
  const providerDetails = getConfiguredAiProviderDetails();
  if (!providerDetails) {
    return {
      configured: false,
      provider: null,
      isHosted: false,
      models: {},
      setupMessage:
        'Kevin is disabled. Set AI_PROVIDER=ollama for the local Gemma model, or set AI_PROVIDER plus the matching hosted API key.',
    };
  }

  return {
    configured: true,
    provider: providerDetails.provider,
    baseURL: providerDetails.baseURL,
    isHosted: providerDetails.provider !== 'ollama',
    models: {
      small: getKevinModelForTier(providerDetails, 'small').modelName,
      medium: getKevinModelForTier(providerDetails, 'medium').modelName,
      large: getKevinModelForTier(providerDetails, 'large').modelName,
    },
  };
}

export async function askKevin(params: {
  orgId: number;
  userId: number;
  message: string;
  threadId?: string | null | undefined;
  preferredModelTier?: KevinModelTier | undefined;
}): Promise<KevinAskResult> {
  const thread = await getOrCreateThread(params.orgId, params.userId, params.threadId);
  const priorMessages = await getRecentThreadMessages(params.orgId, thread.id);
  await storeMessage({
    orgId: params.orgId,
    threadId: thread.id,
    role: 'user',
    content: params.message,
  });

  if (shouldApplyStandardCoaFromMessage(params.message)) {
    const preSnapshot = await createTimeMachineSnapshot({
      orgId: params.orgId,
      userId: params.userId,
      label: 'Before Kevin applied standard chart of accounts',
      description: 'Captured before Kevin changed chart-of-accounts rows.',
      reason: 'kevin_action',
      sourceType: 'kevin_apply_standard_coa',
      sourceId: thread.id,
    });
    const result = await applyStandardChartOfAccounts(params.orgId);
    const response = standardCoaResponse(result);
    const stored = await storeMessage({
      orgId: params.orgId,
      threadId: thread.id,
      role: 'assistant',
      content: response.answer,
      metadata: response,
    });
    const [actionRow] = await db
      .insert(kevinActions)
      .values({
        orgId: params.orgId,
        threadId: thread.id,
        userId: params.userId,
        actionType: KEVIN_ACTION_TYPES.applyStandardCoa,
        status: KEVIN_ACTION_STATUSES.applied,
        payload: { template: 'Standard-COA-v2.csv' },
        result: { ...result, preSnapshotId: preSnapshot.snapshotId },
      })
      .returning();
    if (!actionRow) {
      throw new Error('Failed to record Kevin standard chart action');
    }

    return {
      threadId: thread.id,
      messageId: stored.id,
      response,
      model: null,
      action: {
        actionId: actionRow.id,
        actionType: actionRow.actionType,
        status: actionRow.status,
        journalBatchId: null,
      },
    };
  }

  const providerDetails = getConfiguredAiProviderDetails();

  if (shouldAddAccountsFromMessage(params.message)) {
    if (!providerDetails) {
      const response = accountProposalNeedsConfigurationResponse();
      const stored = await storeMessage({
        orgId: params.orgId,
        threadId: thread.id,
        role: 'assistant',
        content: response.answer,
        metadata: response,
      });
      return { threadId: thread.id, messageId: stored.id, response, model: null, action: null };
    }

    const accountsForOrg = await getAccountsForKevin(params.orgId);
    const model = resolveKevinModel(providerDetails, 'json_extraction', params.preferredModelTier);
    let proposal: KevinAccountProposal;
    try {
      const generated = await generateStructuredObject({
        provider: providerDetails.provider,
        modelName: model.modelName,
        schema: KevinAccountProposalSchema,
        prompt: buildAccountProposalPrompt({
          message: params.message,
          priorMessages,
          accounts: accountsForOrg,
        }),
        providerOptions: getKevinProviderOptions(model),
        timeoutMs: 90_000,
      });
      proposal = generated.object;
    } catch (error) {
      const response = accountProposalCouldNotParseResponse(error);
      const stored = await storeMessage({
        orgId: params.orgId,
        threadId: thread.id,
        role: 'assistant',
        content: response.answer,
        model: model.modelName,
        provider: model.provider,
        metadata: response,
      });
      return { threadId: thread.id, messageId: stored.id, response, model, action: null };
    }

    if (proposal.needsClarification) {
      const response = accountClarificationResponse(proposal);
      const stored = await storeMessage({
        orgId: params.orgId,
        threadId: thread.id,
        role: 'assistant',
        content: response.answer,
        model: model.modelName,
        provider: model.provider,
        metadata: response,
      });
      return { threadId: thread.id, messageId: stored.id, response, model, action: null };
    }

    let result: ApplyAccountProposalsResult;
    let preSnapshotId: string | null = null;
    try {
      const preSnapshot = await createTimeMachineSnapshot({
        orgId: params.orgId,
        userId: params.userId,
        label: 'Before Kevin added accounts',
        description: 'Captured before Kevin changed chart-of-accounts rows.',
        reason: 'kevin_action',
        sourceType: 'kevin_add_accounts',
        sourceId: thread.id,
      });
      preSnapshotId = preSnapshot.snapshotId;
      result = await applyAccountProposals(params.orgId, proposal.accounts);
    } catch (error) {
      const response = accountProposalCouldNotParseResponse(error);
      const stored = await storeMessage({
        orgId: params.orgId,
        threadId: thread.id,
        role: 'assistant',
        content: response.answer,
        model: model.modelName,
        provider: model.provider,
        metadata: response,
      });
      return { threadId: thread.id, messageId: stored.id, response, model, action: null };
    }

    const response = accountCreationResponse(result);
    const stored = await storeMessage({
      orgId: params.orgId,
      threadId: thread.id,
      role: 'assistant',
      content: response.answer,
      model: model.modelName,
      provider: model.provider,
      metadata: response,
    });
    const [actionRow] = await db
      .insert(kevinActions)
      .values({
        orgId: params.orgId,
        threadId: thread.id,
        userId: params.userId,
        actionType: KEVIN_ACTION_TYPES.addAccounts,
        status: KEVIN_ACTION_STATUSES.applied,
        payload: proposal,
        result: { ...result, preSnapshotId },
      })
      .returning();
    if (!actionRow) {
      throw new Error('Failed to record Kevin account action');
    }

    return {
      threadId: thread.id,
      messageId: stored.id,
      response,
      model,
      action: {
        actionId: actionRow.id,
        actionType: actionRow.actionType,
        status: actionRow.status,
        journalBatchId: null,
      },
    };
  }

  const historyOperation = requestedKevinHistoryAction(params.message);
  if (historyOperation) {
    const action = await findLatestKevinActionForOperation(params.orgId, historyOperation);
    if (!action) {
      const response: KevinResponse = {
        answerLabel: {
          answer_type: 'bookkeeping',
          authority_level: 'educational',
          sources_used: [],
          cannot_answer_from_allowlist: false,
        },
        answer: `I could not find a latest Kevin action that can be ${historyOperation === 'undo' ? 'undone' : 'redone'}. Open Time Machine to inspect the available action capsules.`,
        citations: [],
        followUpQuestions: [],
        journalProposal: null,
        memoryWrites: [],
      };
      const stored = await storeMessage({
        orgId: params.orgId,
        threadId: thread.id,
        role: 'assistant',
        content: response.answer,
        metadata: response,
      });
      return { threadId: thread.id, messageId: stored.id, response, model: null, action: null };
    }

    const result =
      historyOperation === 'undo'
        ? await undoKevinAction({
            orgId: params.orgId,
            userId: params.userId,
            actionId: action.id,
          })
        : await redoKevinAction({
            orgId: params.orgId,
            userId: params.userId,
            actionId: action.id,
          });
    const response = kevinHistoryActionResponse(historyOperation, result);
    if (result.actionType === 'time_machine_restore') {
      await ensureThreadExists(params.orgId, params.userId, thread.id);
      await storeMessage({
        orgId: params.orgId,
        threadId: thread.id,
        role: 'user',
        content: params.message,
      });
    }
    const stored = await storeMessage({
      orgId: params.orgId,
      threadId: thread.id,
      role: 'assistant',
      content: response.answer,
      metadata: response,
    });

    return {
      threadId: thread.id,
      messageId: stored.id,
      response,
      model: null,
      action: result,
    };
  }

  if (!providerDetails) {
    const response = fallbackResponse(params.message, getKevinRuntimeStatus().setupMessage);
    const stored = await storeMessage({
      orgId: params.orgId,
      threadId: thread.id,
      role: 'assistant',
      content: response.answer,
      metadata: response,
    });
    return { threadId: thread.id, messageId: stored.id, response, model: null, action: null };
  }

  const taskKind = classifyKevinTask(params.message);
  const model = resolveKevinModel(providerDetails, taskKind, params.preferredModelTier);
  const [accountsForOrg, memories, recentJournals, documents, authorityPages] = await Promise.all([
    getAccountsForKevin(params.orgId),
    getMemoryContext(params.orgId, params.message),
    getRecentJournalContext(params.orgId),
    searchDocumentContext(params.orgId, params.message),
    fetchAuthorityPages(extractAuthorityUrls(params.message)),
  ]);

  const prompt = buildKevinPrompt({
    message: params.message,
    priorMessages,
    accounts: accountsForOrg,
    memories,
    recentJournals,
    documents,
    authorityPages,
  });

  const { object } = await generateStructuredObject({
    provider: providerDetails.provider,
    modelName: model.modelName,
    schema: KevinResponseSchema,
    prompt,
    providerOptions: getKevinProviderOptions(model),
    timeoutMs: model.tier === 'large' ? 180_000 : 90_000,
  });

  const response = validateKevinResponseAuthority(object);

  const stored = await storeMessage({
    orgId: params.orgId,
    threadId: thread.id,
    role: 'assistant',
    content: response.answer,
    model: model.modelName,
    provider: model.provider,
    metadata: response,
  });

  await writeMemoryUpdates({
    orgId: params.orgId,
    userId: params.userId,
    sourceMessageId: stored.id,
    response,
  });

  return {
    threadId: thread.id,
    messageId: stored.id,
    response,
    model,
    action: null,
  };
}
