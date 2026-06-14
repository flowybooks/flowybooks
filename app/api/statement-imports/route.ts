import { getAccountsForTeam, getStatementImportsForTeam, requireActiveCoa } from '@/lib/db/queries';
import { uploadStatement } from '@/lib/imports/statement-import/statement-import-service';
import { apiError, READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';

// Required: uploadStatement uses Buffer.from() which needs Node.js runtime
export const runtime = 'nodejs';
export const maxDuration = 120;

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }) => {
  const imports = await getStatementImportsForTeam(team.id);
  return Response.json({ imports });
});

async function assertLinkedAccountBelongsToTeam(teamId: number, linkedAccountId: string | null) {
  if (!linkedAccountId) {
    return;
  }

  const accounts = await getAccountsForTeam(teamId);
  const account = accounts.find((row) => row.id === linkedAccountId);
  if (!account) {
    throw new Error('Selected statement account does not belong to this organization');
  }
  if (!account.isStatementAccount) {
    throw new Error('Selected account is not marked as a statement account');
  }
}

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, request) => {
    const userId = user.id;
    const teamId = team.id;

    // 3. Extract file from form data
    const formData = await request.formData();
    const file = formData.get('file');
    const statementType = formData.get('statementType');
    const importBatchId = formData.get('importBatchId');
    const linkedAccountId = formData.get('linkedAccountId');

    if (!file || !(file instanceof File)) {
      return apiError('PDF or CSV file is required (field name "file")', 400);
    }

    if (statementType !== 'bank_statement' && statementType !== 'credit_card_statement') {
      return apiError('Statement type is required (bank_statement or credit_card_statement)', 400);
    }

    if (!importBatchId || typeof importBatchId !== 'string') {
      return apiError('importBatchId is required', 400);
    }

    try {
      await requireActiveCoa(teamId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'CoA is not active. Seed or import a Chart of Accounts before continuing.';
      return apiError(message, 400);
    }

    // 4. Call service layer
    try {
      const existingImports = await getStatementImportsForTeam(teamId);
      const isFirstImport = existingImports.length === 0;
      const normalizedLinkedAccountId =
        typeof linkedAccountId === 'string' && linkedAccountId ? linkedAccountId : null;

      await assertLinkedAccountBelongsToTeam(teamId, normalizedLinkedAccountId);

      const { statementImport } = await uploadStatement({
        orgId: teamId,
        userId,
        file,
        statementType,
        importBatchId,
        linkedAccountId: normalizedLinkedAccountId ?? undefined,
      });

      return Response.json(
        {
          success: true,
          importId: statementImport.id,
          importBatchId: statementImport.importBatchId,
          fileName: statementImport.fileName,
          status: statementImport.status,
          isFirstImport,
        },
        { status: 201 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload statement';
      return apiError(message, 400);
    }
  },
);
