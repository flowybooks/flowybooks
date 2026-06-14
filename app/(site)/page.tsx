import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowRight, BookOpen, FileSpreadsheet, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUser } from '@/lib/db/queries';

export const metadata: Metadata = {
  title: 'Flowybooks',
  description:
    'A local-first bookkeeping app for accounts, journals, reports, and statement imports.',
};

const workflowLinks = [
  {
    href: '/dashboard/accounts',
    title: 'Chart of accounts',
    description: 'Create or import the accounts that drive your ledger.',
    icon: BookOpen,
  },
  {
    href: '/dashboard/journal',
    title: 'Journal entries',
    description: 'Draft, post, void, and import balanced journal batches.',
    icon: FileSpreadsheet,
  },
  {
    href: '/dashboard/reports/balance-sheet',
    title: 'Reports',
    description: 'Run balance sheet, income statement, trial balance, and GL views.',
    icon: Scale,
  },
] as const;

export default async function HomePage() {
  const user = await getUser();
  const primaryHref = user ? '/dashboard/reports/balance-sheet' : '/sign-up';

  return (
    <main className="flex-1">
      <section className="border-b border-border/70">
        <div className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:px-8">
          <div className="space-y-7">
            <div className="space-y-4">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Local bookkeeping workspace
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Flowybooks
              </h1>
              <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                A PGlite-backed bookkeeping app for running your books, importing statement data,
                posting journals, and producing core financial reports.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={primaryHref}>
                  {user ? 'Open dashboard' : 'Create workspace'}
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              {!user ? (
                <Button asChild size="lg" variant="outline">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3">
            {workflowLinks.map((item) => (
              <Link
                key={item.href}
                href={user ? item.href : '/sign-up'}
                className="group rounded-md border border-border/70 bg-card/80 p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background">
                    <item.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-medium">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
