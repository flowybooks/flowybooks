import { describe, expect, it, afterEach } from 'vitest';
import { z } from 'zod';
import { zodSchema } from 'ai';
import {
  AiNotConfiguredError,
  generateStructuredObject,
  getConfiguredAiProvider,
  getConfiguredAiProviderDetails,
  isAiConfigured,
  makeOpenAiStrictJsonSchema,
} from '@/lib/kevin/model-client';
import { KevinResponseSchema } from '@/lib/kevin/schemas';
import { statementExtractionSchema } from '@/lib/imports/statement-import/extractors/schemas';

const AI_ENV_KEYS = [
  'AI_PROVIDER',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
] as const;

const originalEnv = AI_ENV_KEYS.reduce<Record<string, string | undefined>>((acc, key) => {
  acc[key] = process.env[key];
  return acc;
}, {});

function clearAiEnv() {
  for (const key of AI_ENV_KEYS) {
    delete process.env[key];
  }
}

afterEach(() => {
  clearAiEnv();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('AI provider configuration', () => {
  it('is disabled when no provider is selected', () => {
    clearAiEnv();

    expect(getConfiguredAiProvider()).toBeNull();
    expect(getConfiguredAiProviderDetails()).toBeNull();
    expect(isAiConfigured()).toBe(false);
  });

  it('configures Ollama from local provider settings without an API key', () => {
    clearAiEnv();
    process.env.AI_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434/v1';
    process.env.OLLAMA_MODEL = 'gemma4:26b-mlx';

    expect(getConfiguredAiProvider()).toBe('ollama');
    expect(getConfiguredAiProviderDetails()).toEqual({
      provider: 'ollama',
      baseURL: 'http://localhost:11434/v1',
      modelName: 'gemma4:26b-mlx',
    });
    expect(isAiConfigured()).toBe(true);
  });

  it('keeps hosted providers disabled until their API key is configured', () => {
    clearAiEnv();
    process.env.AI_PROVIDER = 'openai';

    expect(getConfiguredAiProvider()).toBeNull();
    expect(isAiConfigured()).toBe(false);
  });

  it('reports hosted provider configuration after the matching key is set', () => {
    clearAiEnv();
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.OPENAI_MODEL = 'gpt-test';

    expect(getConfiguredAiProviderDetails()).toEqual({
      provider: 'openai',
      modelName: 'gpt-test',
    });
  });

  it('throws before calling a hosted model if its API key is missing', async () => {
    clearAiEnv();

    await expect(
      generateStructuredObject({
        provider: 'openai',
        schema: z.object({ ok: z.boolean() }),
        prompt: 'Return ok true.',
      }),
    ).rejects.toBeInstanceOf(AiNotConfiguredError);
  });
});

describe('OpenAI strict schema conversion', () => {
  it('marks every object property as required for strict response_format compatibility', async () => {
    const baseSchema = await zodSchema(statementExtractionSchema).jsonSchema;
    const strictSchema = makeOpenAiStrictJsonSchema(baseSchema) as any;

    const metadata = strictSchema.properties.metadata;
    const adjustmentItems = metadata.properties.reconciliationAdjustments.items;
    const transactionItems = strictSchema.properties.transactions.items;

    expect(metadata.required).toEqual(Object.keys(metadata.properties));
    expect(adjustmentItems.required).toEqual(Object.keys(adjustmentItems.properties));
    expect(adjustmentItems.required).toContain('amountCents');
    expect(transactionItems.required).toEqual(Object.keys(transactionItems.properties));
    expect(transactionItems.required).toContain('amountCents');
    expect(transactionItems.required).toContain('checkNumber');
  });

  it('removes unsupported string format metadata from Kevin response URL fields', async () => {
    const baseSchema = await zodSchema(KevinResponseSchema).jsonSchema;
    const strictSchema = makeOpenAiStrictJsonSchema(baseSchema) as any;

    const sourcesItems = strictSchema.properties.answerLabel.properties.sources_used.items;
    const citationItems = strictSchema.properties.citations.items;

    expect(sourcesItems.type).toBe('string');
    expect(sourcesItems.format).toBeUndefined();
    expect(citationItems.type).toBe('string');
    expect(citationItems.format).toBeUndefined();
  });
});
