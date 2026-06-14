import { afterEach, describe, expect, it } from 'vitest';

import { getKevinModelForTier } from '@/lib/kevin/model-router';

const KEVIN_MODEL_ENV_KEYS = [
  'KEVIN_SMALL_MODEL',
  'KEVIN_MEDIUM_MODEL',
  'KEVIN_LARGE_MODEL',
  'KEVIN_OLLAMA_SMALL_MODEL',
  'KEVIN_OLLAMA_MEDIUM_MODEL',
  'KEVIN_OLLAMA_LARGE_MODEL',
  'KEVIN_OPENAI_SMALL_MODEL',
  'KEVIN_OPENAI_MEDIUM_MODEL',
  'KEVIN_OPENAI_LARGE_MODEL',
] as const;

const originalEnv = KEVIN_MODEL_ENV_KEYS.reduce<Record<string, string | undefined>>((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {});

function clearKevinModelEnv() {
  for (const key of KEVIN_MODEL_ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearKevinModelEnv();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('Kevin model router', () => {
  it('defaults all Ollama tiers to the local Gemma baseline', () => {
    clearKevinModelEnv();
    const providerDetails = {
      provider: 'ollama' as const,
      modelName: 'gemma4:26b-mlx',
      baseURL: 'http://localhost:11434/v1',
    };

    expect(getKevinModelForTier(providerDetails, 'small').modelName).toBe('gemma4:26b-mlx');
    expect(getKevinModelForTier(providerDetails, 'medium').modelName).toBe('gemma4:26b-mlx');
    expect(getKevinModelForTier(providerDetails, 'large').modelName).toBe('gemma4:26b-mlx');
  });

  it('keeps stale local tier overrides from leaking into OpenAI routing', () => {
    clearKevinModelEnv();
    process.env.KEVIN_SMALL_MODEL = 'gemma4:26b-mlx';
    process.env.KEVIN_MEDIUM_MODEL = 'gemma4:26b-mlx';
    process.env.KEVIN_LARGE_MODEL = 'gemma4:26b-mlx';
    const providerDetails = {
      provider: 'openai' as const,
      modelName: 'gpt-5-mini',
    };

    expect(getKevinModelForTier(providerDetails, 'small').modelName).toBe('gpt-5-nano');
    expect(getKevinModelForTier(providerDetails, 'medium').modelName).toBe('gpt-5-mini');
    expect(getKevinModelForTier(providerDetails, 'large').modelName).toBe('gpt-5.5');
  });

  it('uses provider-specific Kevin OpenAI tier overrides', () => {
    clearKevinModelEnv();
    process.env.KEVIN_OPENAI_SMALL_MODEL = 'gpt-small-custom';
    process.env.KEVIN_OPENAI_MEDIUM_MODEL = 'gpt-medium-custom';
    process.env.KEVIN_OPENAI_LARGE_MODEL = 'gpt-large-custom';
    const providerDetails = {
      provider: 'openai' as const,
      modelName: 'gpt-5-mini',
    };

    expect(getKevinModelForTier(providerDetails, 'small').modelName).toBe('gpt-small-custom');
    expect(getKevinModelForTier(providerDetails, 'medium').modelName).toBe('gpt-medium-custom');
    expect(getKevinModelForTier(providerDetails, 'large').modelName).toBe('gpt-large-custom');
  });

  it('keeps generic Kevin tier overrides as Ollama compatibility aliases', () => {
    clearKevinModelEnv();
    process.env.KEVIN_MEDIUM_MODEL = 'gemma-local-custom';
    const providerDetails = {
      provider: 'ollama' as const,
      modelName: 'gemma4:26b-mlx',
      baseURL: 'http://localhost:11434/v1',
    };

    expect(getKevinModelForTier(providerDetails, 'medium').modelName).toBe('gemma-local-custom');
  });
});
