import { db } from '@/lib/db/drizzle';
import { kevinMemories } from '@/lib/db/schema';

import type { KevinResponse } from './schemas';

export async function writeMemoryUpdates(params: {
  orgId: number;
  userId: number;
  sourceMessageId: string;
  response: KevinResponse;
}) {
  for (const memory of params.response.memoryWrites) {
    await db
      .insert(kevinMemories)
      .values({
        orgId: params.orgId,
        key: memory.key,
        value: memory.value,
        category: memory.category,
        sourceMessageId: params.sourceMessageId,
        createdBy: params.userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [kevinMemories.orgId, kevinMemories.key],
        set: {
          value: memory.value,
          category: memory.category,
          sourceMessageId: params.sourceMessageId,
          updatedAt: new Date(),
        },
      });
  }
}
