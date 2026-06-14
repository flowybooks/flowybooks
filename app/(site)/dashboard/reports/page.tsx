import Link from 'next/link';

export default function ReportsIndexPage() {
  const links = [
    {
      href: '/dashboard/reports/trial-balance',
      label: 'Trial Balance',
      description: 'Period-based trial balance by account.',
    },
    {
      href: '/dashboard/reports/balance-sheet',
      label: 'Balance Sheet',
      description: 'As-of balance sheet with retained earnings and current year earnings.',
    },
    {
      href: '/dashboard/reports/income-statement',
      label: 'Income Statement',
      description: 'Period and year-to-date income statement.',
    },
    {
      href: '/dashboard/reports/general-ledger',
      label: 'General Ledger',
      description: 'Line-level journal activity for posted entries.',
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground mt-2">
          View key financial reports for your organization.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="border rounded-md p-4 hover:bg-muted/40 transition-colors"
          >
            <h2 className="text-base font-semibold tracking-tight">{link.label}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
