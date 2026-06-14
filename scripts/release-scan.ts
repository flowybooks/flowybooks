import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

type ScanFailure = {
  title: string;
  details: string[];
};

const textExtensions = new Set([
  '.css',
  '.csv',
  '.env',
  '.example',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.mts',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

function runGit(args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8' });

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }

  return result.stdout;
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extensionFor(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot === -1 ? '' : file.slice(dot);
}

function isTextFile(file: string): boolean {
  if (file === '.env.example' || file === '.gitignore' || file === 'LICENSE') {
    return true;
  }
  return textExtensions.has(extensionFor(file));
}

function isSourceLike(file: string): boolean {
  return (
    file.startsWith('app/') ||
    file.startsWith('components/') ||
    file.startsWith('lib/') ||
    file.startsWith('scripts/') ||
    file.startsWith('.github/') ||
    file === 'package.json'
  );
}

async function scanTextFiles(files: string[]) {
  const entries: Array<{ file: string; text: string }> = [];
  for (const file of files) {
    if (!isTextFile(file) || file === 'bun.lock') {
      continue;
    }
    entries.push({ file, text: await readFile(file, 'utf8') });
  }
  return entries;
}

function addFailure(failures: ScanFailure[], title: string, details: string[]) {
  if (details.length > 0) {
    failures.push({ title, details });
  }
}

function matchingLines(
  entries: Array<{ file: string; text: string }>,
  pattern: RegExp,
  options: { allow?: (file: string, line: string) => boolean } = {},
): string[] {
  const matches: string[] = [];
  for (const entry of entries) {
    const fileLines = entry.text.split(/\r?\n/);
    fileLines.forEach((line, index) => {
      pattern.lastIndex = 0;
      if (!pattern.test(line)) {
        return;
      }
      if (options.allow?.(entry.file, line)) {
        return;
      }
      matches.push(`${entry.file}:${index + 1}: ${line.trim()}`);
    });
  }
  return matches;
}

function isNegativeGuardrail(line: string): boolean {
  const normalized = line.toLowerCase();
  return /\b(no|not|never|without)\b/.test(normalized) || normalized.includes('do not');
}

async function main() {
  const trackedFiles = lines(runGit(['ls-files'])).filter((file) => existsSync(file));
  const untrackedFiles = lines(runGit(['ls-files', '--others', '--exclude-standard'])).filter(
    (file) => existsSync(file),
  );
  const candidateFiles = Array.from(new Set([...trackedFiles, ...untrackedFiles])).sort();
  const ignoredTrackedFiles = lines(runGit(['ls-files', '-ci', '--exclude-standard'])).filter(
    (file) => existsSync(file),
  );
  const failures: ScanFailure[] = [];

  addFailure(failures, 'Tracked ignored files', ignoredTrackedFiles);

  const unwantedArtifactPattern =
    /(^|\/)(\.env|\.pglite|\.next|node_modules|artifacts|\.playwright-cli|coverage|test-results|playwright-report)(\/|$)|\.(pdf|docx|xlsx|sqlite|sqlite3|dump|log|webm|tsbuildinfo)$/i;
  addFailure(
    failures,
    'Tracked local/generated/private artifacts',
    candidateFiles.filter((file) => unwantedArtifactPattern.test(file) || file === 'next-env.d.ts'),
  );

  const entries = await scanTextFiles(candidateFiles);

  addFailure(
    failures,
    'Legacy brand/private residue',
    matchingLines(
      entries,
      /\b(Jai Books|jai-books|jai_books|jaibooks|Nishan|nishanseal|Spectrum|Amex|Rey Sol|flowybooks@|Flowy_Books|saas-starter)\b|\/Users\//i,
      {
        allow: (file, line) =>
          file === 'scripts/release-scan.ts' ||
          ((file === 'lib/imports/statement-import/statement-classifier.ts' ||
            file === 'test/imports/statement-import/statement-classifier.test.ts') &&
            /\bamex\b/i.test(line)),
      },
    ),
  );

  addFailure(
    failures,
    'Unexpected email addresses',
    matchingLines(entries, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, {
      allow: (_file, line) =>
        /@example\.com\b/i.test(line) ||
        /@flowybooks\.local\b/i.test(line) ||
        /example\.com\/bot\b/i.test(line),
    }),
  );

  addFailure(
    failures,
    'Billing/SaaS/private implementation terms in source',
    matchingLines(
      entries.filter((entry) => isSourceLike(entry.file)),
      /\b(stripe|billing|subscription|paid[- ]plan|plan gate|billing gate|payment provider|posthog|sentry|vercel|neon|supabase)\b/i,
      {
        allow: (file, line) =>
          file === '.github/dependabot.yml' ||
          file === 'scripts/release-scan.ts' ||
          isNegativeGuardrail(line) ||
          line.toLowerCase().includes('local-first accounting app with no bank feeds'),
      },
    ),
  );

  addFailure(
    failures,
    'Secret-shaped committed values',
    matchingLines(
      entries,
      /(-----BEGIN [A-Z ]*PRIVATE KEY-----)|\b(OPENAI_API_KEY|BETTER_AUTH_SECRET|CRON_SECRET)\s*=\s*([^\s#]+)/,
      {
        allow: (file, line) =>
          (file === 'lib/db/setup.ts' &&
            (line.includes('generateSecret()') || line.includes('aiSetup.key'))) ||
          line.includes('test-openai-key') ||
          /=\s*(change-me|test-|integration-test|$)/i.test(line) ||
          /\bOPENAI_API_KEY=$/.test(line),
      },
    ),
  );

  if (failures.length > 0) {
    console.error('Release scan failed.');
    for (const failure of failures) {
      console.error(`\n${failure.title}`);
      failure.details.slice(0, 50).forEach((detail) => console.error(`- ${detail}`));
      if (failure.details.length > 50) {
        console.error(`- ...and ${failure.details.length - 50} more`);
      }
    }
    process.exit(1);
  }

  console.log('Release scan passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
