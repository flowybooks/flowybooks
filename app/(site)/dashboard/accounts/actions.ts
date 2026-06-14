'use server';

// These server actions mutate the chart of accounts for the current organization.
// They coordinate CSV imports, manual CRUD, and the supporting account-system safeguards.

import {
  getTeamForUser,
  getAccountsForTeam,
  createAccountForTeam,
  updateAccountForTeam,
} from '@/lib/db/queries';
import {
  CLASSIFICATION_TO_TYPE,
  type CoaClassification,
  type CoaType,
} from '@/lib/accounting/accounts-import';
import { applyStandardChartOfAccounts } from '@/lib/accounting/chart-of-accounts-service';
import { revalidatePath } from 'next/cache';
import { requireTeamRole } from '@/lib/auth/middleware';

export type AccountActionState = {
  error?: string;
};

function getActionErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * Returns the accounts for the currently authenticated user's team.
 * Throws if no team is found (which shouldn't happen on protected routes).
 */
export async function listAccountsForCurrentTeam() {
  const team = await getTeamForUser();

  if (!team) {
    throw new Error('Organization not found for current user');
  }

  const accounts = await getAccountsForTeam(team.id);

  return accounts;
}

export async function createAccountAction(
  _prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

    const code = String(formData.get('code') ?? '').trim();
    const name = String(formData.get('name') ?? '').trim();
    const type = formData.get('type');
    const classificationRaw = String(formData.get('classification') ?? '').trim();
    const isActive = formData.get('isActive') === 'on';
    const isStatementAccount = formData.get('isStatementAccount') === 'on';

    if (!code || !name || typeof type !== 'string') {
      return { error: 'Code, name, and type are required.' };
    }

    let classification: CoaClassification | null = null;
    if (classificationRaw) {
      if (!(classificationRaw in CLASSIFICATION_TO_TYPE)) {
        return { error: 'Classification is not valid.' };
      }

      classification = classificationRaw as CoaClassification;
      const expectedType = CLASSIFICATION_TO_TYPE[classification];
      if (expectedType !== (type as CoaType)) {
        return {
          error: `Classification "${classification}" is not valid for Type "${type}". Expected Type "${expectedType}".`,
        };
      }
    }

    const protectedNames = [
      'Retained Earnings',
      'Opening Balance Equity',
      'Prior Period Adjustments',
    ];
    if (protectedNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
      return {
        error: 'This account name is reserved and managed by the system.',
      };
    }

    await createAccountForTeam(team.id, {
      code,
      name,
      type: type as 'asset' | 'liability' | 'equity' | 'income' | 'expense',
      classification,
      isActive,
      isStatementAccount,
    });

    revalidatePath('/dashboard/accounts');
    return {};
  } catch (error) {
    return { error: getActionErrorMessage(error) };
  }
}

export async function updateAccountAction(
  _prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

    const accountId = String(formData.get('accountId') ?? '').trim();
    const name = String(formData.get('name') ?? '').trim();
    const isActive = formData.get('isActive') === 'on';
    const isStatementAccount = formData.get('isStatementAccount') === 'on';

    if (!accountId) {
      return { error: 'Account ID is required.' };
    }

    await updateAccountForTeam(team.id, accountId, {
      name,
      isActive,
      isStatementAccount,
    });

    revalidatePath('/dashboard/accounts');
    return {};
  } catch (error) {
    return { error: getActionErrorMessage(error) };
  }
}

export async function applyStandardCoaAction(_formData: FormData) {
  const { team } = await requireTeamRole(['owner', 'member', 'advisor', 'bookkeeper']);

  await applyStandardChartOfAccounts(team.id);
  revalidatePath('/dashboard/accounts');
}
