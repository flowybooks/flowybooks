// This file handles activity history and audit-trail queries.
// It loads the recent activity a user sees in settings and writes/reads
// the append-only audit log for important accounting changes.

import { and, desc, eq, gte, lte } from 'drizzle-orm';

import { getUser } from './auth';
import { db } from '../drizzle';
import { activityLogs, auditLog, users, type NewAuditLog } from '../schema';
export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name,
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function createAuditEntry(entry: NewAuditLog) {
  const [created] = await db.insert(auditLog).values(entry).returning();
  return created;
}

export async function getAuditLogForEntity(entityType: string, entityId: string, orgId: number) {
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.orgId, orgId),
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLog.timestamp));
}

export async function getAuditLogForOrg(
  orgId: number,
  options?: {
    fromDate?: Date;
    toDate?: Date;
    userId?: number;
    entityType?: string;
    limit?: number;
    offset?: number;
  },
) {
  const conditions = [eq(auditLog.orgId, orgId)];

  if (options?.fromDate) {
    conditions.push(gte(auditLog.timestamp, options.fromDate));
  }
  if (options?.toDate) {
    conditions.push(lte(auditLog.timestamp, options.toDate));
  }
  if (options?.userId) {
    conditions.push(eq(auditLog.userId, options.userId));
  }
  if (options?.entityType) {
    conditions.push(eq(auditLog.entityType, options.entityType));
  }

  const query = db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.timestamp));

  if (options?.limit) {
    query.limit(options.limit);
  }
  if (options?.offset) {
    query.offset(options.offset);
  }

  return query;
}
