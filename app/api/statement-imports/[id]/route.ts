import { NextResponse } from 'next/server';
import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { getStatementImportById, getParsedTransactionsForImport } from '@/lib/db/queries';

export const GET = withApiTeamRole(
  READ_TEAM_ROLES,
  async ({ team }, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const statementImport = await getStatementImportById(id, team.id);
    if (!statementImport) {
      return NextResponse.json({ error: 'Statement import not found' }, { status: 404 });
    }

    const transactions = await getParsedTransactionsForImport(id, team.id);

    // Don't send raw source data in the API response
    const {
      sourceText: _sourceText,
      sourceInfo: _sourceInfo,
      ...importWithoutSourceData
    } = statementImport;
    void _sourceText;
    void _sourceInfo;

    return NextResponse.json({
      import: importWithoutSourceData,
      transactions,
    });
  },
);
