// Iterates Kevin's recommended Ollama models through the local smoke test.
// Missing models fail explicitly so the operator can pull them intentionally.
import { spawn } from 'node:child_process';

const DEFAULT_MODELS = ['gemma4:26b-mlx'];

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function runModel(model: string) {
  const command = ['bun', 'scripts/kevin-smoke-ollama.ts', '--model', model];
  const startedAt = Date.now();
  const proc = spawn(command[0]!, command.slice(1), { env: process.env });
  let stdout = '';
  let stderr = '';

  proc.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => resolve(code ?? 1));
  });

  return {
    model,
    ok: exitCode === 0,
    latencyMs: Date.now() - startedAt,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

async function main() {
  const selectedModels =
    argValue('--models')
      ?.split(',')
      .map((model) => model.trim())
      .filter(Boolean) ?? DEFAULT_MODELS;

  const results = [];
  for (const model of selectedModels) {
    results.push(await runModel(model));
  }

  console.log(JSON.stringify({ ok: results.every((result) => result.ok), results }, null, 2));

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
