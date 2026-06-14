'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings,
  BookOpen,
  BookCopy,
  Bot,
  Calculator,
  History,
  LineChart,
  NotebookPen,
  Scale,
  Upload,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { ReportTabs } from './report-tabs';
import { ReportTabsProvider, useReportTabs, type ReportTabType } from './report-tabs-context';
import { OrgSwitcher } from './org-switcher';

const accountingNavItems: Array<{
  href: string;
  icon: typeof BookOpen;
  label: string;
  tabType: ReportTabType;
}> = [
  {
    href: '/dashboard/reports/balance-sheet',
    icon: Scale,
    label: 'Balance Sheet',
    tabType: 'balance-sheet',
  },
  {
    href: '/dashboard/reports/income-statement',
    icon: LineChart,
    label: 'Income Statement',
    tabType: 'income-statement',
  },
  {
    href: '/dashboard/reports/trial-balance',
    icon: Calculator,
    label: 'Trial Balance',
    tabType: 'trial-balance',
  },
  {
    href: '/dashboard/reports/general-ledger',
    icon: BookOpen,
    label: 'General Ledger',
    tabType: 'general-ledger',
  },
  { href: '/dashboard/accounts', icon: BookCopy, label: 'Chart of Accounts', tabType: 'accounts' },
  { href: '/dashboard/journal', icon: NotebookPen, label: 'Journal Entries', tabType: 'journal' },
  {
    href: '/dashboard/time-machine',
    icon: History,
    label: 'Time Machine',
    tabType: 'time-machine',
  },
  {
    href: '/dashboard/statement-imports',
    icon: Upload,
    label: 'Bank Import',
    tabType: 'bank-import',
  },
  { href: '/dashboard/kevin', icon: Bot, label: 'Kevin', tabType: 'kevin' },
];

function AppSidebar() {
  const pathname = usePathname();
  const { openTab } = useReportTabs();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar>
      <SidebarHeader className="px-3 pt-3 pb-1">
        <OrgSwitcher />
      </SidebarHeader>
      <SidebarContent className="gap-3 px-1.5 pb-4">
        {/* Accounting Section */}
        <SidebarGroup className="px-2">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.25em] text-sidebar-foreground/60 px-2">
            Accounting
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {accountingNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    type="button"
                    isActive={isActive(item.href)}
                    onClick={() => openTab(item.tabType)}
                    className="rounded-md px-3 py-2 text-[13px]"
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="px-2">
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.25em] text-sidebar-foreground/60 px-2">
            Settings
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/dashboard'}
                  className="rounded-md px-3 py-2 text-[13px]"
                >
                  <Link href="/dashboard">
                    <Settings className="h-4 w-4" />
                    <span>Local Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider data-dashboard-shell>
      <Suspense fallback={null}>
        <ReportTabsProvider>
          <AppSidebar />
          <SidebarInset className="bg-muted/20">
            {/* Mobile header with trigger */}
            <header
              className="flex h-12 items-center gap-4 bg-background px-4 md:hidden"
              data-print-hidden
            >
              <SidebarTrigger />
              <span className="font-medium">Menu</span>
            </header>

            {/* Report tabs */}
            <div className="flex items-center justify-start px-4 pt-3 pb-1.5" data-dashboard-tabs>
              <ReportTabs />
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto px-4 pb-6" data-dashboard-main>
              <div className="min-h-full">{children}</div>
            </div>
          </SidebarInset>
        </ReportTabsProvider>
      </Suspense>
    </SidebarProvider>
  );
}
