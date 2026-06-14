import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const PUBLIC_API_ROUTE_ALLOWLIST = new Set([
  'app/api/accounts/standard-coa/route.ts',
  'app/api/auth/[...all]/route.ts',
]);

type Violation = {
  file: string;
  reason: string;
};

type ContentRule = {
  pattern: RegExp;
  reason: string;
};

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function relative(root: string, file: string) {
  return path.relative(root, file).split(path.sep).join('/');
}

function isUiFile(root: string, file: string) {
  const rel = relative(root, file);
  if (!/\.(tsx|jsx)$/.test(rel)) return false;
  if (rel.startsWith('app/api/')) return false;
  return rel.startsWith('app/') || rel.startsWith('components/');
}

function isApiRouteFile(root: string, file: string) {
  const rel = relative(root, file);
  return rel.startsWith('app/api/') && rel.endsWith('/route.ts');
}

function exportedHttpMethods(content: string): string[] {
  const methods = new Set<string>();
  const methodGroup = HTTP_METHODS.join('|');
  const functionPattern = new RegExp(`export\\s+async\\s+function\\s+(${methodGroup})\\b`, 'g');
  const constPattern = new RegExp(`export\\s+const\\s+(${methodGroup})\\s*=`, 'g');

  for (const match of content.matchAll(functionPattern)) {
    if (match[1]) methods.add(match[1]);
  }
  for (const match of content.matchAll(constPattern)) {
    if (match[1]) methods.add(match[1]);
  }

  return Array.from(methods);
}

const restrictedUiImports: ContentRule[] = [
  {
    pattern: /from ['"]@\/lib\/db\/schema['"]/,
    reason: 'UI must depend on narrow view/domain types, not Drizzle schema rows.',
  },
  {
    pattern: /from ['"]@\/lib\/db\/drizzle['"]/,
    reason: 'UI must not import the database client.',
  },
  {
    pattern: /from ['"]drizzle-orm['"]/,
    reason: 'UI must not import Drizzle query helpers.',
  },
];

const approvedApiAuthPatterns: ContentRule[] = [
  {
    pattern: /\bwithApiTeamRole\s*\(/,
    reason: 'protected by withApiTeamRole',
  },
  {
    pattern: /\bgetUser\s*\(/,
    reason: 'uses explicit user authentication',
  },
  {
    pattern: /\bgetTeamForUser\s*\(/,
    reason: 'uses explicit team lookup for authenticated user',
  },
  {
    pattern: /\bgetBetterAuthSession\s*\(/,
    reason: 'uses Better Auth session validation',
  },
  {
    pattern: /\bCRON_SECRET\b/,
    reason: 'uses cron bearer-secret validation',
  },
  {
    pattern: /\bhandler\s*\(\s*['"](GET|POST|PUT|PATCH|DELETE)['"]\s*,/,
    reason: 'delegates to Better Auth handler',
  },
];

function checkUiBoundaries(root: string, violations: Violation[]) {
  for (const searchRoot of ['app', 'components']) {
    const absoluteRoot = path.join(root, searchRoot);
    if (!existsSync(absoluteRoot) || !statSync(absoluteRoot).isDirectory()) continue;

    for (const file of walk(absoluteRoot)) {
      if (!isUiFile(root, file)) continue;
      const content = readFileSync(file, 'utf8');
      for (const rule of restrictedUiImports) {
        if (rule.pattern.test(content)) {
          violations.push({ file: relative(root, file), reason: rule.reason });
        }
      }
    }
  }
}

function checkApiRoutes(root: string, violations: Violation[]) {
  const apiRoot = path.join(root, 'app/api');
  if (!existsSync(apiRoot) || !statSync(apiRoot).isDirectory()) return;

  for (const file of walk(apiRoot)) {
    if (!isApiRouteFile(root, file)) continue;
    const rel = relative(root, file);
    const content = readFileSync(file, 'utf8');
    const methods = exportedHttpMethods(content);
    if (methods.length === 0) continue;
    if (PUBLIC_API_ROUTE_ALLOWLIST.has(rel)) continue;
    if (approvedApiAuthPatterns.some((rule) => rule.pattern.test(content))) continue;

    violations.push({
      file: rel,
      reason: `API route exports ${methods.join(', ')} without an approved auth guard or allowlist entry.`,
    });
  }
}

export function checkArchitecture(root = process.cwd()): Violation[] {
  const violations: Violation[] = [];
  checkUiBoundaries(root, violations);
  checkApiRoutes(root, violations);
  return violations;
}

if (import.meta.main) {
  const violations = checkArchitecture();

  if (violations.length > 0) {
    console.error('Architecture check failed.');
    for (const violation of violations) {
      console.error(`- ${violation.file}: ${violation.reason}`);
    }
    process.exit(1);
  }

  console.log('Architecture check passed.');
}
