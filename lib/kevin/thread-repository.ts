import { and, asc, desc, eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { kevinMessages, kevinThreads } from '@/lib/db/schema';

import type { KevinActionResult, KevinThreadMessage, KevinThreadSnapshot } from './types';
import { KevinResponseSchema, type KevinResponse } from './schemas';
import { truncate } from './format';

function normalizeKevinMessageRole(role: string): 'user' | 'assistant' {
  return role === 'user' ? 'user' : 'assistant';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseKevinResponseMetadata(metadata: unknown): KevinResponse | undefined {
  const parsed = KevinResponseSchema.safeParse(metadata);
  return parsed.success ? parsed.data : undefined;
}

function parseKevinActionMetadata(metadata: unknown): KevinActionResult | null {
  if (!isRecord(metadata) || !isRecord(metadata.action)) {
    return null;
  }

  const action = metadata.action;
  if (
    typeof action.actionId !== 'string' ||
    typeof action.actionType !== 'string' ||
    typeof action.status !== 'string'
  ) {
    return null;
  }

  return {
    actionId: action.actionId,
    actionType: action.actionType,
    status: action.status,
    journalBatchId: typeof action.journalBatchId === 'string' ? action.journalBatchId : null,
  };
}

export async function getOrCreateThread(
  orgId: number,
  userId: number,
  threadId?: string | null | undefined,
) {
  if (threadId) {
    const [existing] = await db
      .select()
      .from(kevinThreads)
      .where(and(eq(kevinThreads.orgId, orgId), eq(kevinThreads.id, threadId)))
      .limit(1);
    if (existing) return existing;
  }

  const [created] = await db
    .insert(kevinThreads)
    .values({
      orgId,
      createdBy: userId,
      title: 'Kevin chat',
    })
    .returning();
  if (!created) {
    throw new Error('Unable to create Kevin thread.');
  }

  return created;
}

export async function ensureThreadExists(orgId: number, userId: number, threadId: string) {
  const [existing] = await db
    .select({ id: kevinThreads.id })
    .from(kevinThreads)
    .where(and(eq(kevinThreads.orgId, orgId), eq(kevinThreads.id, threadId)))
    .limit(1);

  if (existing) return;

  await db.insert(kevinThreads).values({
    id: threadId,
    orgId,
    createdBy: userId,
    title: 'Kevin chat',
  });
}

export async function getRecentThreadMessages(orgId: number, threadId: string) {
  const rows = await db
    .select({
      role: kevinMessages.role,
      content: kevinMessages.content,
      createdAt: kevinMessages.createdAt,
    })
    .from(kevinMessages)
    .where(and(eq(kevinMessages.orgId, orgId), eq(kevinMessages.threadId, threadId)))
    .orderBy(desc(kevinMessages.createdAt))
    .limit(8);

  return rows.reverse().map((row) => ({
    role: row.role,
    content: truncate(row.content, 2_000),
  }));
}

export async function getLatestKevinThreadSnapshot(orgId: number): Promise<KevinThreadSnapshot> {
  const [thread] = await db
    .select({ id: kevinThreads.id })
    .from(kevinThreads)
    .where(eq(kevinThreads.orgId, orgId))
    .orderBy(desc(kevinThreads.updatedAt))
    .limit(1);

  if (!thread) {
    return { threadId: null, messages: [] };
  }

  const rows = await db
    .select({
      id: kevinMessages.id,
      role: kevinMessages.role,
      content: kevinMessages.content,
      metadata: kevinMessages.metadata,
      createdAt: kevinMessages.createdAt,
    })
    .from(kevinMessages)
    .where(and(eq(kevinMessages.orgId, orgId), eq(kevinMessages.threadId, thread.id)))
    .orderBy(asc(kevinMessages.createdAt))
    .limit(80);

  const messages: KevinThreadMessage[] = rows.map((row) => {
    const response = parseKevinResponseMetadata(row.metadata);
    const action = parseKevinActionMetadata(row.metadata);

    return {
      id: row.id,
      role: normalizeKevinMessageRole(row.role),
      content: row.content,
      ...(response ? { response } : {}),
      ...(action ? { action } : {}),
    };
  });

  return { threadId: thread.id, messages };
}

export async function storeMessage(params: {
  orgId: number;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null | undefined;
  provider?: string | null | undefined;
  metadata?: unknown | undefined;
}) {
  const [message] = await db
    .insert(kevinMessages)
    .values({
      orgId: params.orgId,
      threadId: params.threadId,
      role: params.role,
      content: params.content,
      model: params.model ?? null,
      provider: params.provider ?? null,
      metadata: params.metadata ?? null,
    })
    .returning();
  if (!message) {
    throw new Error('Unable to store Kevin message.');
  }

  await db
    .update(kevinThreads)
    .set({ updatedAt: new Date() })
    .where(eq(kevinThreads.id, params.threadId));

  return message;
}
