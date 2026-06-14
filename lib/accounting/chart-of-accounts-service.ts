// Applies bundled chart-of-accounts templates through the shared import planner.
// Keep account mutations org-scoped and behind accounting import safeguards.
import fs from 'fs/promises';
import path from 'path';

import { and, eq, sql } from 'drizzle-orm';

import {
  isCoaClassification,
  parseCoaCsv,
  planCoaImport,
  type CoaClassification,
  type ExistingAccount,
  type ParsedCoaRow,
} from '@/lib/accounting/accounts-import';
import { db } from '@/lib/db/drizzle';
import { ensureSystemEquityAccounts } from '@/lib/db/queries';
import { accounts, journalLines } from '@/lib/db/schema';

export type ApplyChartOfAccountsResult = {
  created: number;
  updated: number;
  deleted: number;
};

export class ChartOfAccountsImportError extends Error {
  constructor(readonly errors: string[]) {
    super(errors[0] ?? 'Chart of accounts import failed.');
    this.name = 'ChartOfAccountsImportError';
  }
}

function requireCoaClassification(value: string | null, code: string): CoaClassification {
  if (isCoaClassification(value)) {
    return value;
  }
  throw new Error(`Existing account "${code}" is missing a valid classification.`);
}

async function getExistingAccountsForImport(orgId: number): Promise<ExistingAccount[]> {
  const existingRows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
      isActive: accounts.isActive,
      activityCount: sql<number>`COUNT(${journalLines.id})`,
    })
    .from(accounts)
    .leftJoin(
      journalLines,
      and(eq(journalLines.orgId, accounts.orgId), eq(journalLines.accountId, accounts.id)),
    )
    .where(eq(accounts.orgId, orgId))
    .groupBy(accounts.id);

  return existingRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    classification: requireCoaClassification(row.classification, row.code),
    isActive: row.isActive,
    hasActivity: (row.activityCount ?? 0) > 0,
  }));
}

export async function applyChartOfAccountsRows(
  orgId: number,
  rows: ParsedCoaRow[],
): Promise<ApplyChartOfAccountsResult> {
  const existingAccounts = await getExistingAccountsForImport(orgId);
  const plan = planCoaImport(rows, existingAccounts, { supersedeMissing: true });

  if (plan.errors.length > 0) {
    throw new ChartOfAccountsImportError(plan.errors);
  }

  await db.transaction(async (tx) => {
    if (plan.toCreate.length > 0) {
      await tx.insert(accounts).values(
        plan.toCreate.map((acc) => ({
          orgId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          classification: acc.classification,
          isActive: acc.isActive,
        })),
      );
    }

    for (const acc of plan.toUpdate) {
      await tx
        .update(accounts)
        .set({
          code: acc.code,
          name: acc.name,
          type: acc.type,
          classification: acc.classification,
          isActive: acc.isActive,
          updatedAt: new Date(),
        })
        .where(and(eq(accounts.id, acc.id), eq(accounts.orgId, orgId)));
    }

    for (const del of plan.toDelete) {
      await tx.delete(accounts).where(and(eq(accounts.id, del.id), eq(accounts.orgId, orgId)));
    }
  });

  await ensureSystemEquityAccounts(orgId);

  return {
    created: plan.toCreate.length,
    updated: plan.toUpdate.length,
    deleted: plan.toDelete.length,
  };
}

export async function applyStandardChartOfAccounts(
  orgId: number,
): Promise<ApplyChartOfAccountsResult> {
  const filePath = path.join(process.cwd(), 'Standard-COA-v2.csv');
  const csvText = await fs.readFile(filePath, 'utf8');
  const rows = parseCoaCsv(csvText);

  return applyChartOfAccountsRows(orgId, rows);
}
