// Indexes allowed local documents for Kevin into org-scoped DB chunks.
// The crawler blocks symlink and path traversal escapes from LOCAL_AGENT_FILES_DIR.
import crypto from 'node:crypto';
import path from 'node:path';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';

import { db } from '../lib/db/drizzle';
import { kevinDocumentChunks, kevinDocuments } from '../lib/db/schema';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json']);
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 500;
const MAX_DEPTH = 8;
const CHUNK_CHARS = 3_500;

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function required(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function collectFiles(rootRealPath: string, current: string, depth = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  const currentStat = await lstat(current);
  if (currentStat.isSymbolicLink()) {
    return [];
  }

  if (currentStat.isFile()) {
    const extension = path.extname(current).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) return [];
    const currentRealPath = await realpath(current);
    if (!isWithinRoot(rootRealPath, currentRealPath)) return [];
    if (currentStat.size > MAX_FILE_BYTES) return [];
    return [currentRealPath];
  }

  if (!currentStat.isDirectory()) return [];

  const entries = await readdir(current);
  const files: string[] = [];
  for (const entry of entries) {
    if (files.length >= MAX_FILES) break;
    files.push(...(await collectFiles(rootRealPath, path.join(current, entry), depth + 1)));
  }
  return files.slice(0, MAX_FILES);
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += CHUNK_CHARS) {
    const chunk = text.slice(index, index + CHUNK_CHARS).trim();
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

async function indexFile(params: { orgId: number; rootRealPath: string; filePath: string }) {
  const fileStat = await stat(params.filePath);
  const relativePath = path.relative(params.rootRealPath, params.filePath);
  const content = await readFile(params.filePath, 'utf8');
  const chunks = chunkText(content);
  const pathHash = sha256(params.filePath);

  const [document] = await db
    .insert(kevinDocuments)
    .values({
      orgId: params.orgId,
      sourceType: 'local_dir',
      title: relativePath,
      fileName: path.basename(params.filePath),
      pathHash,
      mimeType: 'text/plain',
      metadata: {
        relativePath,
        sizeBytes: fileStat.size,
        indexedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [kevinDocuments.orgId, kevinDocuments.pathHash],
      set: {
        title: relativePath,
        fileName: path.basename(params.filePath),
        metadata: {
          relativePath,
          sizeBytes: fileStat.size,
          indexedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      },
    })
    .returning({ id: kevinDocuments.id });
  if (!document) {
    throw new Error(`Unable to index document ${relativePath}`);
  }

  await db.delete(kevinDocumentChunks).where(eq(kevinDocumentChunks.documentId, document.id));

  if (chunks.length > 0) {
    await db.insert(kevinDocumentChunks).values(
      chunks.map((chunk, index) => ({
        orgId: params.orgId,
        documentId: document.id,
        chunkIndex: index,
        content: chunk,
        metadata: { relativePath },
      })),
    );
  }

  return { relativePath, chunks: chunks.length };
}

async function main() {
  const orgId = Number(
    required(
      argValue('--org-id') ?? process.env.KEVIN_INDEX_ORG_ID,
      'Set KEVIN_INDEX_ORG_ID or pass --org-id <id>.',
    ),
  );
  if (!Number.isInteger(orgId) || orgId <= 0) {
    throw new Error('Kevin document indexing requires a positive numeric org id.');
  }

  const configuredDir = required(
    argValue('--dir') ?? process.env.LOCAL_AGENT_FILES_DIR,
    'Set LOCAL_AGENT_FILES_DIR or pass --dir <path>.',
  );
  const rootRealPath = await realpath(path.resolve(configuredDir));
  const files = await collectFiles(rootRealPath, rootRealPath);
  const indexed = [];

  for (const filePath of files) {
    indexed.push(await indexFile({ orgId, rootRealPath, filePath }));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        orgId,
        root: rootRealPath,
        filesIndexed: indexed.length,
        indexed,
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
