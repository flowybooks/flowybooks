import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  accounts,
  auditLog,
  journalBatches,
  journalLines,
  kevinActions,
  kevinDocumentChunks,
  kevinDocuments,
  kevinMemories,
  kevinMessages,
  kevinThreads,
  members,
  organizations,
  parsedTransactions,
  statementImports,
  timeMachineSnapshots,
  users,
} from '@/lib/db/schema';

export async function cleanupOrg(orgId: number) {
  await db.delete(auditLog).where(eq(auditLog.orgId, orgId));
  await db.delete(kevinActions).where(eq(kevinActions.orgId, orgId));
  await db.delete(kevinMessages).where(eq(kevinMessages.orgId, orgId));
  await db.delete(kevinMemories).where(eq(kevinMemories.orgId, orgId));
  await db.delete(kevinDocumentChunks).where(eq(kevinDocumentChunks.orgId, orgId));
  await db.delete(kevinDocuments).where(eq(kevinDocuments.orgId, orgId));
  await db.delete(kevinThreads).where(eq(kevinThreads.orgId, orgId));
  await db.delete(timeMachineSnapshots).where(eq(timeMachineSnapshots.orgId, orgId));
  await db.delete(parsedTransactions).where(eq(parsedTransactions.orgId, orgId));
  await db.delete(statementImports).where(eq(statementImports.orgId, orgId));
  await db.delete(journalLines).where(eq(journalLines.orgId, orgId));
  await db.delete(journalBatches).where(eq(journalBatches.orgId, orgId));
  await db.delete(accounts).where(eq(accounts.orgId, orgId));
  await db.delete(members).where(eq(members.teamId, orgId));
  await db.delete(organizations).where(eq(organizations.id, orgId));
}

export async function cleanupUser(userId: number) {
  await db.delete(users).where(eq(users.id, userId));
}
