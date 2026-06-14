// Shared Kevin service types used by API handlers and the dashboard UI.
// These types intentionally omit provider secrets and raw financial text.
import type { KevinJournalProposal, KevinResponse } from './schemas';
import type { KevinModelTier, KevinResolvedModel } from './model-router';

export type KevinRuntimeStatus = {
  configured: boolean;
  provider: string | null;
  baseURL?: string | undefined;
  isHosted: boolean;
  models: Partial<Record<KevinModelTier, string>>;
  setupMessage?: string | undefined;
};

export type KevinActionResult = {
  actionId: string;
  actionType: string;
  status: string;
  journalBatchId: string | null;
};

export type KevinAskResult = {
  threadId: string;
  messageId: string | null;
  response: KevinResponse;
  model: KevinResolvedModel | null;
  action: KevinActionResult | null;
};

export type KevinThreadMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: KevinResponse | undefined;
  action?: KevinActionResult | null | undefined;
};

export type KevinThreadSnapshot = {
  threadId: string | null;
  messages: KevinThreadMessage[];
};

export type { KevinModelTier };
export type { KevinJournalProposal, KevinResponse };
