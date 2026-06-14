// Runs a local-only Kevin smoke test against an Ollama model.
// The script refuses non-local Ollama URLs to avoid accidental network calls.
import { z } from 'zod';

import { generateStructuredObject } from '../lib/kevin/model-client';

const SmokeSchema = z.object({
  answer_type: z.enum(['bookkeeping']),
  account_code: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  explanation: z.string(),
});

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function assertLocalOllamaBaseUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  const allowed =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';
  if (!allowed) {
    throw new Error(`Ollama smoke tests must use a local base URL, got ${rawUrl}`);
  }
}

async function main() {
  const model = argValue('--model') ?? process.env.OLLAMA_MODEL ?? 'gemma4:26b-mlx';
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';

  assertLocalOllamaBaseUrl(baseUrl);
  process.env.AI_PROVIDER = 'ollama';
  process.env.OLLAMA_BASE_URL = baseUrl;
  process.env.OLLAMA_MODEL = model;

  const startedAt = Date.now();
  const { object, provider } = await generateStructuredObject({
    provider: 'ollama',
    modelName: model,
    schema: SmokeSchema,
    prompt: [
      'Return one JSON object only with all four required keys.',
      'Use exactly this shape: {"answer_type":"bookkeeping","account_code":"60000","confidence":"high","explanation":"short text"}.',
      'Task: suggest the most likely account code for this local bookkeeping memo.',
      'Chart: 60000 Utilities Expense, 21000 Accounts Payable, 40000 Sales.',
      'Memo: June electric bill not yet paid.',
      'Use answer_type bookkeeping.',
      'Use a string for account_code, not a number.',
    ].join('\n'),
    timeoutMs: 120_000,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider,
        model,
        latencyMs: Date.now() - startedAt,
        object,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
