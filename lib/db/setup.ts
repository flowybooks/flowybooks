import { promises as fs, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';

import { DEFAULT_PGLITE_DATA_DIR, assertPersistentPGliteDataDir } from './pglite-path';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';
const DEFAULT_OLLAMA_MODEL = 'gemma4:26b-mlx';
const scriptedAnswers = process.stdin.isTTY ? null : readFileSync(0, 'utf8').split(/\r?\n/);
let scriptedAnswerIndex = 0;
let rl: readline.Interface | null = null;
const forceOverwrite =
  process.argv.includes('--force') || process.env.FLOWYBOOKS_SETUP_OVERWRITE_ENV === '1';

type AiSetup =
  | {
      provider: 'ollama';
      baseURL: string;
      model: string;
    }
  | {
      provider: 'openai';
      key: string;
    };

function question(query: string): Promise<string> {
  if (scriptedAnswers) {
    process.stdout.write(query);
    const answer = scriptedAnswers[scriptedAnswerIndex] ?? '';
    scriptedAnswerIndex += 1;
    process.stdout.write('\n');
    return Promise.resolve(answer);
  }

  rl ??= readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl?.question(query, resolve));
}

async function getPGliteDataDirFromPrompt(): Promise<string> {
  console.log('\n--- Step 1: Database Setup ---');
  console.log('Flowybooks stores books in a durable local PGlite Postgres filesystem directory.');

  while (true) {
    const value = await question(`PGlite data directory (${DEFAULT_PGLITE_DATA_DIR}): `);
    const dataDir = value.trim() || DEFAULT_PGLITE_DATA_DIR;

    try {
      assertPersistentPGliteDataDir(dataDir);
      await fs.mkdir(path.resolve(process.cwd(), dataDir), { recursive: true });
      return dataDir;
    } catch (error) {
      if (scriptedAnswers) {
        throw error;
      }

      console.error(error instanceof Error ? error.message : 'Invalid PGlite data directory');
    }
  }
}

async function getAISetup() {
  console.log('\n--- Step 2: Optional AI Setup ---');
  console.log(
    'Flowybooks works without AI. AI is used for PDF extraction, categorization, and Kevin when configured.',
  );
  const enable = await question('Do you want to configure AI now? (y/N): ');
  if (enable.trim().toLowerCase() !== 'y') {
    return null;
  }

  console.log('Select your default AI provider.');
  console.log('1. Ollama local (no cloud account)');
  console.log('2. OpenAI hosted/API mode (gpt-5-mini)');

  const choice = await question('Select a provider (1-2): ');

  if (choice.trim() === '1') {
    const baseURL = await question(
      `Ollama OpenAI-compatible base URL (${DEFAULT_OLLAMA_BASE_URL}): `,
    );
    const model = await question(`Ollama model (${DEFAULT_OLLAMA_MODEL}): `);
    return {
      provider: 'ollama',
      baseURL: baseURL.trim() || DEFAULT_OLLAMA_BASE_URL,
      model: model.trim() || DEFAULT_OLLAMA_MODEL,
    } satisfies AiSetup;
  }

  const key = await question('Enter your OpenAI API key: ');
  return { provider: 'openai', key: key.trim() } satisfies AiSetup;
}

function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function envBackupPath(envPath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${envPath}.backup-${stamp}`;
}

async function confirmEnvOverwrite(envPath: string): Promise<boolean> {
  if (forceOverwrite) {
    return true;
  }

  if (scriptedAnswers) {
    throw new Error(
      `.env already exists at ${envPath}. Refusing to overwrite it in noninteractive setup. Move it first, rerun with --force, or set FLOWYBOOKS_SETUP_OVERWRITE_ENV=1.`,
    );
  }

  const answer = await question(
    `.env already exists. Overwrite it and save a timestamped backup first? (y/N): `,
  );
  return answer.trim().toLowerCase() === 'y';
}

async function writeEnvFile(envVars: Record<string, string>) {
  console.log('\n--- Step 3: Configuring Environment Files ---');
  const envContent = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const envPath = path.join(process.cwd(), '.env');
  if (await fileExists(envPath)) {
    const overwrite = await confirmEnvOverwrite(envPath);
    if (!overwrite) {
      throw new Error('Setup canceled. Existing .env was left unchanged.');
    }

    const backupPath = envBackupPath(envPath);
    await fs.copyFile(envPath, backupPath);
    console.log(`Existing .env backed up to ${path.basename(backupPath)}.`);
  }

  await fs.writeFile(envPath, `${envContent}\n`);
  console.log('.env file created successfully with local PGlite settings.');
}

async function main() {
  console.log('============================================');
  console.log('          Flowybooks Setup Wizard          ');
  console.log('============================================');

  const PGLITE_DATA_DIR = await getPGliteDataDirFromPrompt();
  const aiSetup = await getAISetup();

  const BASE_URL = 'http://localhost:3000';
  const BETTER_AUTH_SECRET = generateSecret();

  const envVars: Record<string, string> = {
    PGLITE_DATA_DIR,
    BASE_URL,
    BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: BASE_URL,
    NEXT_PUBLIC_BETTER_AUTH_URL: BASE_URL,
    CRON_SECRET: generateSecret(),
    AI_PROVIDER: '',
    FLOWYBOOKS_USER_AGENT: 'flowybooks-local/0.1',
    LOCAL_AGENT_FILES_DIR: '',
    KEVIN_INDEX_ORG_ID: '',
  };

  if (aiSetup) {
    envVars.AI_PROVIDER = aiSetup.provider;
    if (aiSetup.provider === 'ollama') {
      envVars.OLLAMA_BASE_URL = aiSetup.baseURL;
      envVars.OLLAMA_MODEL = aiSetup.model;
      envVars.KEVIN_OLLAMA_SMALL_MODEL = 'gemma4:26b-mlx';
      envVars.KEVIN_OLLAMA_MEDIUM_MODEL = 'gemma4:26b-mlx';
      envVars.KEVIN_OLLAMA_LARGE_MODEL = 'gemma4:26b-mlx';
    } else {
      envVars.OPENAI_API_KEY = aiSetup.key;
      envVars.KEVIN_OPENAI_SMALL_MODEL = 'gpt-5-nano';
      envVars.KEVIN_OPENAI_MEDIUM_MODEL = 'gpt-5-mini';
      envVars.KEVIN_OPENAI_LARGE_MODEL = 'gpt-5.5';
    }
  }

  await writeEnvFile(envVars);

  console.log('\n============================================');
  console.log('Setup completed successfully.');
  console.log('Run the following commands to get started:');
  console.log('1. bun run db:migrate  (Create local PGlite tables)');
  console.log('2. bun run dev         (Launch developer server at localhost:3000)');
  console.log('============================================\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    rl?.close();
  });
