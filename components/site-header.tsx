'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Menu } from 'lucide-react';
import type { SafeUser } from '@/lib/db/queries';
import { UserMenuClient } from '@/app/(site)/_components/user-menu-client';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const appLinks = [
  { href: '/dashboard/reports/balance-sheet', label: 'Reports' },
  { href: '/dashboard/accounts', label: 'Accounts' },
  { href: '/dashboard/journal', label: 'Journals' },
  { href: '/dashboard/statement-imports', label: 'Imports' },
] as const;

function BrandLink() {
  return (
    <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
      <span className="flex size-8 items-center justify-center rounded-md border border-border/70 bg-card">
        <BookOpen className="size-4" />
      </span>
      <span>Flowybooks</span>
    </Link>
  );
}

export function SiteHeader({ user }: { user: SafeUser | null }) {
  const pathname = usePathname();
  const isDashboardRoute = pathname.startsWith('/dashboard');
  const showAppLinks = Boolean(user) || isDashboardRoute;
  const linkClassName = (href: string) =>
    `rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground ${
      pathname === href || pathname.startsWith(`${href}/`) ? 'bg-accent/70 text-foreground' : ''
    }`;

  return (
    <header
      className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border/70 bg-background/90 px-4 backdrop-blur-xl"
      data-app-header
    >
      <div className="flex min-w-0 items-center gap-6">
        <BrandLink />

        {showAppLinks ? (
          <nav className="hidden items-center gap-1 md:flex">
            {appLinks.map((link) => (
              <Link key={link.href} href={link.href} className={linkClassName(link.href)}>
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {showAppLinks ? (
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-9 md:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(22rem,88vw)] overflow-y-auto border-border/70 bg-background p-0">
              <SheetHeader className="border-b border-border/70 p-6">
                <SheetTitle className="sr-only">Flowybooks navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  App navigation and account links
                </SheetDescription>
                <BrandLink />
              </SheetHeader>

              <nav className="flex flex-col gap-1 px-4 py-6 text-sm">
                {appLinks.map((link) => (
                  <SheetClose key={link.href} asChild>
                    <Link href={link.href} className={linkClassName(link.href)}>
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Link href="/dashboard" className={linkClassName('/dashboard')}>
                    Settings
                  </Link>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        ) : null}

        {user ? (
          <UserMenuClient user={user} />
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Sign Up</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
