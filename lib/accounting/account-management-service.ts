// This file handles typed chart-of-accounts additions proposed by app tools.
// It validates inferred account details before writing org-scoped accounts so
// model output cannot bypass CoA invariants or protected-name checks.

import { and, eq, sql } from 'drizzle-orm';

import {
  CLASSIFICATION_TO_TYPE,
  isCoaClassification,
  type CoaClassification,
  type CoaType,
} from '@/lib/accounting/accounts-import';
import { db } from '@/lib/db/drizzle';
import { isProtectedSystemAccount } from '@/lib/db/queries';
import { accounts, journalLines } from '@/lib/db/schema';

export type AccountProposalInput = {
  name: string;
  code?: string | null | undefined;
  type: CoaType;
  classification: CoaClassification;
  isStatementAccount?: boolean | null | undefined;
  reason?: string | null | undefined;
};

export type AppliedAccount = {
  id: string;
  code: string;
  name: string;
  type: CoaType;
  classification: CoaClassification;
  isStatementAccount: boolean;
};

export type ExistingAccountMatch = AppliedAccount & {
  id: string;
};

export type ApplyAccountProposalsResult = {
  created: AppliedAccount[];
  existing: ExistingAccountMatch[];
};

export type UndoAccountProposalsResult = {
  deleted: AppliedAccount[];
  deactivated: AppliedAccount[];
  missing: AppliedAccount[];
};

export type RedoAccountProposalsResult = {
  created: AppliedAccount[];
  reactivated: AppliedAccount[];
  existing: AppliedAccount[];
};

const CODE_RANGES: Record<CoaType, { start: number; end: number }> = {
  asset: { start: 10000, end: 19900 },
  liability: { start: 20000, end: 29900 },
  equity: { start: 30000, end: 39900 },
  income: { start: 40000, end: 49900 },
  expense: { start: 50000, end: 89900 },
};

const CLASSIFICATION_CODE_STARTS: Partial<Record<CoaClassification, number>> = {
  current_asset: 14000,
  fixed_asset: 15000,
  current_liability: 23000,
  noncurrent_liability: 25000,
  sales: 40000,
  income: 41000,
  cogs: 51000,
  operating_expense: 67000,
  fixed_costs: 61000,
};

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!/^\d{5}$/.test(trimmed)) {
    throw new Error(`Account code "${trimmed}" must be exactly five digits.`);
  }
  return trimmed;
}

function validateProposal(proposal: AccountProposalInput) {
  const name = proposal.name.trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new Error('Account name is required.');
  }

  if (name.length > 255) {
    throw new Error(`Account name "${name}" is too long.`);
  }

  if (isProtectedSystemAccount({ name })) {
    throw new Error(`"${name}" is a system-protected account name.`);
  }

  if (!isCoaClassification(proposal.classification)) {
    throw new Error(`Classification "${proposal.classification}" is not valid.`);
  }

  const expectedType = CLASSIFICATION_TO_TYPE[proposal.classification];
  if (expectedType !== proposal.type) {
    throw new Error(
      `Classification "${proposal.classification}" requires account type "${expectedType}", not "${proposal.type}".`,
    );
  }

  return {
    name,
    code: normalizeCode(proposal.code),
    type: proposal.type,
    classification: proposal.classification,
    isStatementAccount: proposal.isStatementAccount === true,
  };
}

function formatCode(value: number): string {
  return String(value).padStart(5, '0');
}

function chooseAccountCode(params: {
  requestedCode: string | null;
  type: CoaType;
  classification: CoaClassification;
  usedCodes: Set<string>;
}): string {
  if (params.requestedCode && !params.usedCodes.has(params.requestedCode)) {
    return params.requestedCode;
  }

  const typeRange = CODE_RANGES[params.type];
  const requestedStart = params.requestedCode ? Number(params.requestedCode) : null;
  const classificationStart = CLASSIFICATION_CODE_STARTS[params.classification];
  const start =
    requestedStart && requestedStart >= typeRange.start && requestedStart <= typeRange.end
      ? requestedStart
      : classificationStart &&
          classificationStart >= typeRange.start &&
          classificationStart <= typeRange.end
        ? classificationStart
        : typeRange.start;

  for (let candidate = start; candidate <= typeRange.end; candidate += 100) {
    const code = formatCode(candidate);
    if (!params.usedCodes.has(code)) {
      return code;
    }
  }

  for (let candidate = typeRange.start; candidate <= typeRange.end; candidate += 100) {
    const code = formatCode(candidate);
    if (!params.usedCodes.has(code)) {
      return code;
    }
  }

  throw new Error(`No available ${params.type} account code remains in the configured range.`);
}

export async function applyAccountProposals(
  orgId: number,
  proposals: AccountProposalInput[],
): Promise<ApplyAccountProposalsResult> {
  if (proposals.length === 0) {
    throw new Error('At least one account proposal is required.');
  }

  const existingRows = await db
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
      isStatementAccount: accounts.isStatementAccount,
    })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));

  const usedCodes = new Set(existingRows.map((account) => account.code));
  const existingByName = new Map(
    existingRows.map((account) => [normalizeName(account.name), account]),
  );
  const seenProposalNames = new Set<string>();
  const created: AppliedAccount[] = [];
  const existing: ExistingAccountMatch[] = [];

  await db.transaction(async (tx) => {
    for (const rawProposal of proposals) {
      const proposal = validateProposal(rawProposal);
      const normalizedName = normalizeName(proposal.name);
      if (seenProposalNames.has(normalizedName)) {
        continue;
      }
      seenProposalNames.add(normalizedName);

      const existingAccount = existingByName.get(normalizedName);
      if (existingAccount) {
        existing.push({
          id: existingAccount.id,
          code: existingAccount.code,
          name: existingAccount.name,
          type: existingAccount.type,
          classification: existingAccount.classification as CoaClassification,
          isStatementAccount: existingAccount.isStatementAccount,
        });
        continue;
      }

      const code = chooseAccountCode({
        requestedCode: proposal.code,
        type: proposal.type,
        classification: proposal.classification,
        usedCodes,
      });
      usedCodes.add(code);

      const [inserted] = await tx
        .insert(accounts)
        .values({
          orgId,
          code,
          name: proposal.name,
          type: proposal.type,
          classification: proposal.classification,
          isActive: true,
          isStatementAccount: proposal.isStatementAccount,
        })
        .returning({
          id: accounts.id,
          code: accounts.code,
          name: accounts.name,
          type: accounts.type,
          classification: accounts.classification,
          isStatementAccount: accounts.isStatementAccount,
        });
      if (!inserted) {
        throw new Error('Unable to create account proposal.');
      }

      created.push({
        id: inserted.id,
        code: inserted.code,
        name: inserted.name,
        type: inserted.type,
        classification: inserted.classification as CoaClassification,
        isStatementAccount: inserted.isStatementAccount,
      });
      existingByName.set(normalizedName, inserted);
    }
  });

  return { created, existing };
}

export async function undoAppliedAccountProposals(
  orgId: number,
  accountSnapshots: AppliedAccount[],
): Promise<UndoAccountProposalsResult> {
  const deleted: AppliedAccount[] = [];
  const deactivated: AppliedAccount[] = [];
  const missing: AppliedAccount[] = [];

  await db.transaction(async (tx) => {
    for (const snapshot of accountSnapshots) {
      const [account] = await tx
        .select({
          id: accounts.id,
          code: accounts.code,
          name: accounts.name,
          type: accounts.type,
          classification: accounts.classification,
          isStatementAccount: accounts.isStatementAccount,
        })
        .from(accounts)
        .where(and(eq(accounts.orgId, orgId), eq(accounts.id, snapshot.id)))
        .limit(1);

      if (!account) {
        missing.push(snapshot);
        continue;
      }

      const [activity] = await tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(journalLines)
        .where(and(eq(journalLines.orgId, orgId), eq(journalLines.accountId, account.id)));
      const hasActivity = Number(activity?.count ?? 0) > 0;

      const appliedAccount: AppliedAccount = {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        classification: account.classification as CoaClassification,
        isStatementAccount: account.isStatementAccount,
      };

      if (hasActivity) {
        await tx
          .update(accounts)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(eq(accounts.orgId, orgId), eq(accounts.id, account.id)));
        deactivated.push(appliedAccount);
        continue;
      }

      await tx.delete(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, account.id)));
      deleted.push(appliedAccount);
    }
  });

  return { deleted, deactivated, missing };
}

export async function redoAppliedAccountProposals(
  orgId: number,
  accountSnapshots: AppliedAccount[],
): Promise<RedoAccountProposalsResult> {
  const created: AppliedAccount[] = [];
  const reactivated: AppliedAccount[] = [];
  const existing: AppliedAccount[] = [];

  for (const snapshot of accountSnapshots) {
    const [account] = await db
      .select({
        id: accounts.id,
        code: accounts.code,
        name: accounts.name,
        type: accounts.type,
        classification: accounts.classification,
        isActive: accounts.isActive,
        isStatementAccount: accounts.isStatementAccount,
      })
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.name, snapshot.name)))
      .limit(1);

    if (account) {
      const appliedAccount: AppliedAccount = {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        classification: account.classification as CoaClassification,
        isStatementAccount: account.isStatementAccount,
      };

      if (!account.isActive) {
        await db
          .update(accounts)
          .set({
            isActive: true,
            isStatementAccount: snapshot.isStatementAccount,
            updatedAt: new Date(),
          })
          .where(and(eq(accounts.orgId, orgId), eq(accounts.id, account.id)));
        reactivated.push({ ...appliedAccount, isStatementAccount: snapshot.isStatementAccount });
      } else {
        existing.push(appliedAccount);
      }
      continue;
    }

    const result = await applyAccountProposals(orgId, [
      {
        name: snapshot.name,
        code: snapshot.code,
        type: snapshot.type,
        classification: snapshot.classification,
        isStatementAccount: snapshot.isStatementAccount,
      },
    ]);
    created.push(...result.created);
    existing.push(...result.existing);
  }

  return { created, reactivated, existing };
}
