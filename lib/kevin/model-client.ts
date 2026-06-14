import { generateObject, jsonSchema, zodSchema, type JSONSchema7 } from 'ai';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { z } from 'zod';

export type AiProvider = 'openai' | 'ollama';

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
type ProviderOptions = Record<string, { [key: string]: JsonValue }>;

type HostedProvider = Exclude<AiProvider, 'ollama'>;

const PROVIDERS = ['openai', 'ollama'] as const;

export type ConfiguredAiProvider = {
  provider: AiProvider;
  modelName: string;
  baseURL?: string | undefined;
};

type GenerateStructuredObjectParams<TOutput> = {
  schema: z.ZodType<TOutput>;
  prompt: string;
  /**
   * Optional model name override for this call.
   * If omitted, the default for the chosen provider is used.
   */
  modelName?: string | undefined;
  /**
   * Optional temperature override.
   * If omitted, falls back to LLM_TEMPERATURE or 0 for deterministic output.
   */
  temperature?: number | undefined;
  /**
   * Optional provider override.
   * If omitted, falls back to AI_PROVIDER.
   */
  provider?: AiProvider | undefined;
  /**
   * Optional timeout for the LLM call (best-effort via abort signal).
   */
  timeoutMs?: number | undefined;
  /**
   * Provider-specific options passed through to the AI SDK.
   */
  providerOptions?: ProviderOptions | undefined;
};

const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';
const DEFAULT_OLLAMA_MODEL = 'gemma4:26b-mlx';

const PROVIDER_ENV_KEYS: Record<HostedProvider, string[]> = {
  openai: ['OPENAI_API_KEY'],
};

export class AiNotConfiguredError extends Error {
  status = 503;

  constructor(message = getAiSetupMessage()) {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

function isProvider(value: string | undefined): value is AiProvider {
  return PROVIDERS.includes(value as AiProvider);
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getHostedModelName(provider: HostedProvider): string {
  void provider;
  return readOptionalEnv('OPENAI_MODEL') ?? DEFAULT_OPENAI_MODEL;
}

function getOllamaBaseURL(): string {
  return readOptionalEnv('OLLAMA_BASE_URL') ?? DEFAULT_OLLAMA_BASE_URL;
}

function getOllamaModelName(): string {
  return readOptionalEnv('OLLAMA_MODEL') ?? DEFAULT_OLLAMA_MODEL;
}

function hasProviderApiKey(provider: HostedProvider): boolean {
  return PROVIDER_ENV_KEYS[provider].some((key) => Boolean(readOptionalEnv(key)));
}

function isProviderConfigured(provider: AiProvider): boolean {
  if (provider === 'ollama') {
    return Boolean(getOllamaBaseURL() && getOllamaModelName());
  }

  return hasProviderApiKey(provider);
}

export function getConfiguredAiProviderDetails(): ConfiguredAiProvider | null {
  const provider = process.env.AI_PROVIDER;
  if (!isProvider(provider)) {
    return null;
  }
  if (!isProviderConfigured(provider)) {
    return null;
  }

  if (provider === 'ollama') {
    return {
      provider,
      modelName: getOllamaModelName(),
      baseURL: getOllamaBaseURL(),
    };
  }

  return {
    provider,
    modelName: getHostedModelName(provider),
  };
}

export function getConfiguredAiProvider(): AiProvider | null {
  return getConfiguredAiProviderDetails()?.provider ?? null;
}

export function isAiConfigured(): boolean {
  return getConfiguredAiProvider() !== null;
}

export function getAiSetupMessage(): string {
  return 'AI extraction is disabled. Set AI_PROVIDER=ollama for local Ollama, or set AI_PROVIDER=openai with OPENAI_API_KEY to enable hosted extraction and AI categorization.';
}

function getProviderConfigError(provider: AiProvider): string {
  if (provider === 'ollama') {
    return 'AI_PROVIDER is "ollama", but Ollama configuration is incomplete. Set OLLAMA_BASE_URL and OLLAMA_MODEL, or use the documented defaults.';
  }

  return `AI_PROVIDER is "${provider}", but the matching API key is not configured.`;
}

function resolveProvider(explicit?: AiProvider): AiProvider {
  if (explicit) {
    if (!isProviderConfigured(explicit)) {
      throw new AiNotConfiguredError(getProviderConfigError(explicit));
    }
    return explicit;
  }

  const provider = process.env.AI_PROVIDER;
  if (!provider) {
    throw new AiNotConfiguredError();
  }
  if (!isProvider(provider)) {
    throw new AiNotConfiguredError(
      `Unsupported AI_PROVIDER "${provider}". Use one of: ${PROVIDERS.join(', ')}.`,
    );
  }
  if (!isProviderConfigured(provider)) {
    throw new AiNotConfiguredError(getProviderConfigError(provider));
  }

  return provider;
}

function resolveTemperature(explicit?: number): number {
  if (typeof explicit === 'number') {
    return explicit;
  }

  const fromEnv = process.env.LLM_TEMPERATURE;
  if (fromEnv === undefined) {
    return 0;
  }

  const parsed = Number(fromEnv);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveModel(provider: AiProvider, override?: string) {
  if (provider === 'ollama') {
    const modelName = override ?? getOllamaModelName();
    const ollama = createOpenAI({
      baseURL: getOllamaBaseURL(),
      apiKey: 'ollama',
      name: 'ollama',
    });
    return { modelName, model: ollama.chat(modelName) };
  }

  const modelName = override ?? getHostedModelName(provider);
  return { modelName, model: openai(modelName) };
}

function supportsTemperature(provider: AiProvider, modelName: string): boolean {
  if (provider === 'openai' && /^gpt-5(?:[.-]|$)/.test(modelName)) {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rewriteJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rewriteJsonSchema);
  }

  if (!isRecord(value)) {
    return value;
  }

  const rewritten: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'format') {
      continue;
    }
    rewritten[key] = rewriteJsonSchema(child);
  }

  if (isRecord(rewritten.properties)) {
    rewritten.required = Object.keys(rewritten.properties);
    rewritten.additionalProperties ??= false;
  }

  return rewritten;
}

export function makeOpenAiStrictJsonSchema(schema: JSONSchema7): JSONSchema7 {
  return rewriteJsonSchema(schema) as JSONSchema7;
}

async function resolveSchemaForProvider<TOutput>(provider: AiProvider, schema: z.ZodType<TOutput>) {
  if (provider !== 'openai') {
    return schema;
  }

  const strictSchema = makeOpenAiStrictJsonSchema(await zodSchema(schema).jsonSchema);
  return jsonSchema<TOutput>(strictSchema, {
    validate: (value) => {
      const parsed = schema.safeParse(value);
      if (parsed.success) {
        return { success: true, value: parsed.data };
      }

      return { success: false, error: parsed.error };
    },
  });
}

async function buildPromptForProvider<TOutput>(
  provider: AiProvider,
  schema: z.ZodType<TOutput>,
  prompt: string,
) {
  if (provider !== 'ollama') {
    return prompt;
  }

  const jsonSchemaForPrompt = await zodSchema(schema).jsonSchema;
  return [
    prompt,
    '',
    'Return only valid JSON. Do not include markdown, prose, comments, or omitted fields.',
    'The JSON must match this schema exactly, including string values where strings are required:',
    JSON.stringify(jsonSchemaForPrompt),
  ].join('\n');
}

async function repairStructuredObjectText({ text }: { text: string }) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject !== -1 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }

  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray !== -1 && lastArray > firstArray) {
    return trimmed.slice(firstArray, lastArray + 1);
  }

  return null;
}

export async function generateStructuredObject<TOutput>(
  params: GenerateStructuredObjectParams<TOutput>,
): Promise<{ object: TOutput; model: string; provider: AiProvider }> {
  const provider = resolveProvider(params.provider);
  const temperature = resolveTemperature(params.temperature);
  const { modelName, model } = resolveModel(provider, params.modelName);
  const schema = await resolveSchemaForProvider(provider, params.schema);
  const prompt = await buildPromptForProvider(provider, params.schema, params.prompt);

  const abortSignal =
    typeof params.timeoutMs === 'number'
      ? AbortSignal.timeout
        ? AbortSignal.timeout(params.timeoutMs)
        : (() => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), params.timeoutMs);
            return controller.signal;
          })()
      : undefined;

  const { object } = await generateObject({
    model,
    schema,
    prompt,
    ...(supportsTemperature(provider, modelName) && temperature !== undefined
      ? { temperature }
      : {}),
    ...(abortSignal ? { abortSignal } : {}),
    ...(params.providerOptions ? { providerOptions: params.providerOptions } : {}),
    experimental_repairText: repairStructuredObjectText,
  });

  return {
    object: object as TOutput,
    model: modelName,
    provider,
  };
}
