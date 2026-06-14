// Resolves Kevin's provider-specific model tiers from environment configuration.
// This keeps model names visible and deterministic without storing API keys.
import type { AiProvider, ConfiguredAiProvider } from './model-client';

export type KevinModelTier = 'small' | 'medium' | 'large';

export type KevinTaskKind =
  | 'transaction_classification'
  | 'vendor_normalization'
  | 'memo_cleanup'
  | 'account_suggestion'
  | 'json_extraction'
  | 'journal_proposal'
  | 'reconciliation_explanation'
  | 'ledger_qa'
  | 'ask_kevin'
  | 'hard_reasoning'
  | 'tax_classification'
  | 'workpaper_logic'
  | 'depreciation'
  | 'entity_tax_treatment'
  | 'exception_review';

export type KevinResolvedModel = {
  tier: KevinModelTier;
  taskKind: KevinTaskKind;
  provider: AiProvider;
  modelName: string;
  baseURL?: string | undefined;
  isHosted: boolean;
};

export const KEVIN_TASK_TIER: Record<KevinTaskKind, KevinModelTier> = {
  transaction_classification: 'small',
  vendor_normalization: 'small',
  memo_cleanup: 'small',
  account_suggestion: 'small',
  json_extraction: 'small',
  journal_proposal: 'medium',
  reconciliation_explanation: 'medium',
  ledger_qa: 'medium',
  ask_kevin: 'medium',
  hard_reasoning: 'large',
  tax_classification: 'large',
  workpaper_logic: 'large',
  depreciation: 'large',
  entity_tax_treatment: 'large',
  exception_review: 'large',
};

const OLLAMA_DEFAULTS: Record<KevinModelTier, string> = {
  small: 'gemma4:26b-mlx',
  medium: 'gemma4:26b-mlx',
  large: 'gemma4:26b-mlx',
};

const OPENAI_DEFAULTS: Record<KevinModelTier, string> = {
  small: 'gpt-5-nano',
  medium: 'gpt-5-mini',
  large: 'gpt-5.5',
};

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function tierEnvSuffix(tier: KevinModelTier) {
  if (tier === 'small') return 'SMALL';
  if (tier === 'large') return 'LARGE';
  return 'MEDIUM';
}

function modelOverrideEnvKeys(provider: AiProvider, tier: KevinModelTier) {
  const suffix = tierEnvSuffix(tier);

  if (provider === 'ollama') {
    return [`KEVIN_OLLAMA_${suffix}_MODEL`, `KEVIN_${suffix}_MODEL`];
  }

  if (provider === 'openai') {
    return [`KEVIN_OPENAI_${suffix}_MODEL`];
  }

  return [];
}

function readModelOverride(provider: AiProvider, tier: KevinModelTier): string | undefined {
  for (const key of modelOverrideEnvKeys(provider, tier)) {
    const value = readOptionalEnv(key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function defaultModelForProvider(
  providerDetails: ConfiguredAiProvider,
  tier: KevinModelTier,
): string {
  if (providerDetails.provider === 'ollama') {
    return OLLAMA_DEFAULTS[tier];
  }

  if (providerDetails.provider === 'openai') {
    return OPENAI_DEFAULTS[tier];
  }

  return providerDetails.modelName;
}

export function getKevinModelForTier(
  providerDetails: ConfiguredAiProvider,
  tier: KevinModelTier,
  taskKind: KevinTaskKind = 'ask_kevin',
): KevinResolvedModel {
  const envOverride = readModelOverride(providerDetails.provider, tier);
  const modelName = envOverride ?? defaultModelForProvider(providerDetails, tier);

  return {
    tier,
    taskKind,
    provider: providerDetails.provider,
    modelName,
    baseURL: providerDetails.baseURL,
    isHosted: providerDetails.provider !== 'ollama',
  };
}

export function getKevinModelForTask(
  providerDetails: ConfiguredAiProvider,
  taskKind: KevinTaskKind,
): KevinResolvedModel {
  const tier = KEVIN_TASK_TIER[taskKind];
  return getKevinModelForTier(providerDetails, tier, taskKind);
}

export function classifyKevinTask(message: string): KevinTaskKind {
  const normalized = message.toLowerCase();

  if (
    /\b(macrs|tax|irs|irc|section 168|entity|s corp|partnership|depreciation|capitalized|deductible)\b/.test(
      normalized,
    )
  ) {
    if (/\bdepreciation|macrs|placed[- ]in[- ]service\b/.test(normalized)) {
      return 'depreciation';
    }
    if (/\bentity|s corp|partnership|llc|c corp\b/.test(normalized)) {
      return 'entity_tax_treatment';
    }
    return 'tax_classification';
  }

  if (/\b(reconcile|reconciliation|variance|tie out|doesn't tie)\b/.test(normalized)) {
    return 'reconciliation_explanation';
  }

  if (/\b(book|post|record|journal|debit|credit|accrual|payable|prepaid)\b/.test(normalized)) {
    return 'journal_proposal';
  }

  if (/\b(vendor|merchant|memo|description|categorize|classify|account)\b/.test(normalized)) {
    return 'account_suggestion';
  }

  return 'ask_kevin';
}
