import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import {
  getStatementImportById,
  getParsedTransactionsForImport,
  getAccountsForTeam,
} from '@/lib/db/queries';
import { toJournalCsv, type JournalCsvRow } from '@/lib/accounting/journal-export';

export const GET = withApiTeamRole(
  READ_TEAM_ROLES,
  async ({ team }, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;

    const statementImport = await getStatementImportById(id, team.id);
    if (!statementImport) {
      return new Response(JSON.stringify({ error: 'Statement import not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const [transactions, accounts] = await Promise.all([
      getParsedTransactionsForImport(id, team.id),
      getAccountsForTeam(team.id),
    ]);

    if (transactions.length === 0) {
      return new Response(JSON.stringify({ error: 'No transactions to export' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accountIdToCode = new Map(accounts.map((a) => [a.id, a.code]));

    if (!statementImport.linkedAccountId) {
      return new Response(
        JSON.stringify({ error: 'Please select a bank account before exporting CSV' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const bankAccountCode = accountIdToCode.get(statementImport.linkedAccountId) ?? '';

    const rows: JournalCsvRow[] = [];

    for (const tx of transactions) {
      const amountDollars = Math.abs(tx.amountCents) / 100;
      const isDeposit = tx.amountCents > 0;

      const categoryCode =
        tx.confirmedAccountId && accountIdToCode.get(tx.confirmedAccountId)
          ? accountIdToCode.get(tx.confirmedAccountId)!
          : '';

      const narration = `Statement import: ${statementImport.fileName}`;
      const glDate = tx.transactionDate;

      if (isDeposit) {
        // Debit bank (asset increases), Credit income
        rows.push({
          glDate,
          narration,
          description: tx.description,
          glAccount: bankAccountCode,
          debit: amountDollars,
          credit: 0,
        });
        rows.push({
          glDate,
          narration,
          description: tx.description,
          glAccount: categoryCode,
          debit: 0,
          credit: amountDollars,
        });
      } else {
        // Expense / money out: Credit bank (asset decreases), Debit expense
        rows.push({
          glDate,
          narration,
          description: tx.description,
          glAccount: bankAccountCode,
          debit: 0,
          credit: amountDollars,
        });
        rows.push({
          glDate,
          narration,
          description: tx.description,
          glAccount: categoryCode,
          debit: amountDollars,
          credit: 0,
        });
      }
    }

    const csv = toJournalCsv(rows);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `statement-${date}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  },
);
