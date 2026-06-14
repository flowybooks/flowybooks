import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkArchitecture } from '@/scripts/architecture-check';

let tempRoots: string[] = [];

function tempProject() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'flowybooks-arch-check-'));
  tempRoots.push(root);
  return root;
}

function writeProjectFile(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

describe('architecture-check', () => {
  afterEach(() => {
    for (const root of tempRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tempRoots = [];
  });

  it('fails closed for API route handlers without an approved auth pattern', () => {
    const root = tempProject();
    writeProjectFile(
      root,
      'app/api/private/route.ts',
      `export async function GET() {
        return Response.json({ ok: true });
      }`,
    );

    expect(checkArchitecture(root)).toEqual([
      {
        file: 'app/api/private/route.ts',
        reason: 'API route exports GET without an approved auth guard or allowlist entry.',
      },
    ]);
  });

  it('allows routes protected by withApiTeamRole', () => {
    const root = tempProject();
    writeProjectFile(
      root,
      'app/api/private/route.ts',
      `import { withApiTeamRole } from '@/lib/auth/api';
       export const POST = withApiTeamRole(['owner'], async () => Response.json({ ok: true }));`,
    );

    expect(checkArchitecture(root)).toEqual([]);
  });

  it('allows intentionally public route files on the allowlist', () => {
    const root = tempProject();
    writeProjectFile(
      root,
      'app/api/accounts/standard-coa/route.ts',
      `export async function GET() {
        return new Response('code,name');
      }`,
    );

    expect(checkArchitecture(root)).toEqual([]);
  });
});
