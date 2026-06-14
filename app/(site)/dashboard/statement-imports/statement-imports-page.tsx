import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getAccountsForTeam, getTeamForUser } from '@/lib/db/queries';
import { listBatchesForCurrentTeam, listStatementImportsForCurrentTeam } from './actions';
import { StatementImportDropzone } from './statement-import-dropzone';
import { StatementImportsAutoProcess } from './statement-imports-auto-process';
import { getAiSetupMessage, isAiConfigured } from '@/lib/kevin/model-client';

const BATCH_STATUS_STYLES: Record<string, string> = {
  processing: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  failed: 'bg-red-50 text-red-700 ring-red-600/20',
  ready: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  imported: 'bg-green-50 text-green-700 ring-green-600/20',
};

function formatBatchStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function StatementImportsPage() {
  const team = await getTeamForUser();

  if (!team) {
    return (
      <div className="p-6">
        <div className="p-4 border rounded-md bg-muted/50 text-muted-foreground">
          Please create or select an organization to view bank imports.
        </div>
      </div>
    );
  }

  const [batches, imports, accounts] = await Promise.all([
    listBatchesForCurrentTeam(),
    listStatementImportsForCurrentTeam(),
    getAccountsForTeam(team.id),
  ]);
  const aiEnabled = isAiConfigured();

  const statementAccounts = accounts.filter((a) => a.isActive && a.isStatementAccount);

  const accountLabels = new Map(
    accounts.map((account) => [account.id, `${account.code} - ${account.name}`]),
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bank Import</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Upload bank statements grouped by account.
        </p>
      </div>

      <StatementImportDropzone statementAccounts={statementAccounts} />
      {!aiEnabled ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {getAiSetupMessage()} CSV imports and manual categorization still work.
        </div>
      ) : null}
      <StatementImportsAutoProcess
        aiEnabled={aiEnabled}
        imports={imports.map((imp) => ({ id: imp.id, status: imp.status }))}
      />

      <div>
        {batches.length === 0 ? (
          <div className="border rounded-md p-6 text-center text-muted-foreground">
            No bank imports yet.
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead>Modified Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-center">Files</TableHead>
                  <TableHead className="text-center">Txns</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => {
                  const accountLabel = batch.linkedAccountId
                    ? (accountLabels.get(batch.linkedAccountId) ?? 'Linked account')
                    : 'Unlinked account';

                  const typeLabel = batch.statementType === 'credit_card_statement' ? 'CC' : '';

                  return (
                    <TableRow key={batch.importBatchId}>
                      <TableCell className="text-muted-foreground">
                        <Link
                          href={`/dashboard/statement-imports/${batch.importBatchId}`}
                          className="hover:underline"
                        >
                          <div>
                            {batch.modifiedAt.toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="text-[11px] text-muted-foreground/80">
                            Imported{' '}
                            {batch.createdAt.toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/statement-imports/${batch.importBatchId}`}
                          className="font-medium hover:underline"
                        >
                          {accountLabel}
                        </Link>
                        {typeLabel && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-purple-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-purple-700 ring-1 ring-inset ring-purple-600/20">
                            {typeLabel}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {batch.fileCount}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">
                        {batch.transactionCount > 0 ? `${batch.transactionCount} txns` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            BATCH_STATUS_STYLES[batch.status] ?? BATCH_STATUS_STYLES.ready
                          }`}
                        >
                          {formatBatchStatusLabel(batch.status)}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
