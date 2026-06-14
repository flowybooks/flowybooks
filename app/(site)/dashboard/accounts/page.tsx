import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getTeamForUser } from '@/lib/db/queries';
import { listAccountsForCurrentTeam, applyStandardCoaAction } from './actions';
import { AccountRowEditor, CreateAccountForm } from './account-forms';
import { PrintButton } from '../print-button';

function formatClassification(classification?: string | null): string {
  if (!classification) {
    return '-';
  }

  return classification
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default async function AccountsPage() {
  const teamData = await getTeamForUser();

  if (!teamData) {
    return (
      <div className="p-6">
        <div className="p-4 border bg-muted/50 text-muted-foreground">
          Please create or select an organization to view accounts.
        </div>
      </div>
    );
  }

  const allAccounts = await listAccountsForCurrentTeam();

  return (
    <div className="p-6" data-print-page>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">{teamData.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3" data-print-hidden>
          <form action={applyStandardCoaAction}>
            <button
              type="submit"
              className="inline-flex items-center bg-foreground text-background px-3 py-1.5 text-sm font-medium hover:opacity-80"
            >
              Apply Standard CoA
            </button>
          </form>
          <a
            href="/api/accounts/standard-coa"
            className="inline-flex items-center border border-foreground px-3 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background transition-colors"
          >
            Download Standard CSV
          </a>
          <Link
            href="/dashboard/accounts/import-csv"
            className="inline-flex items-center border border-foreground px-3 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background transition-colors"
          >
            Import CoA CSV
          </Link>
          <a
            href="/api/accounts/export-csv"
            className="inline-flex items-center border border-foreground px-3 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background transition-colors"
          >
            Export CoA CSV
          </a>
          <PrintButton
            variant="outline"
            size="sm"
            label="Print"
            printTitle={`Chart of Accounts - ${teamData.name}`}
          />
        </div>
      </div>

      <div className="mb-8 border p-4" data-print-hidden>
        <h2 className="text-lg font-semibold mb-3">Add New Account</h2>
        <CreateAccountForm />
      </div>

      <div className="border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[80px]">Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[80px]">Type</TableHead>
              <TableHead className="hidden sm:table-cell" data-print-table-cell>
                Classification
              </TableHead>
              <TableHead className="w-[220px] text-left" data-print-hidden>
                <span className="sr-only">Account settings</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No accounts found.
                </TableCell>
              </TableRow>
            ) : (
              allAccounts.map((account) => (
                <AccountRowEditor
                  key={account.id}
                  account={account}
                  classificationLabel={formatClassification(account.classification)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
