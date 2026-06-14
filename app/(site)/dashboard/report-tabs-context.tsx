'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type ReportTabType =
  | 'balance-sheet'
  | 'income-statement'
  | 'trial-balance'
  | 'general-ledger'
  | 'journal'
  | 'time-machine'
  | 'accounts'
  | 'bank-import'
  | 'kevin';

export type ReportTab = {
  id: string;
  type: ReportTabType;
  href: string;
};

export type DefaultPeriodMode = 'previous_month' | 'current_month' | 'year_to_date' | 'custom';

export type DefaultPeriod = {
  mode: DefaultPeriodMode;
  customFrom?: string;
  customTo?: string;
};

type TabDefinition = {
  label: string;
  href: string;
  canDuplicate: boolean;
  periodKind: 'range' | 'asOf' | 'none';
};

const TAB_DEFINITIONS: Record<ReportTabType, TabDefinition> = {
  'balance-sheet': {
    label: 'Balance Sheet',
    href: '/dashboard/reports/balance-sheet',
    canDuplicate: true,
    periodKind: 'asOf',
  },
  'income-statement': {
    label: 'Income Statement',
    href: '/dashboard/reports/income-statement',
    canDuplicate: true,
    periodKind: 'range',
  },
  'trial-balance': {
    label: 'Trial Balance',
    href: '/dashboard/reports/trial-balance',
    canDuplicate: true,
    periodKind: 'range',
  },
  'general-ledger': {
    label: 'General Ledger',
    href: '/dashboard/reports/general-ledger',
    canDuplicate: true,
    periodKind: 'range',
  },
  journal: {
    label: 'Journal Entries',
    href: '/dashboard/journal',
    canDuplicate: false,
    periodKind: 'none',
  },
  'time-machine': {
    label: 'Time Machine',
    href: '/dashboard/time-machine',
    canDuplicate: false,
    periodKind: 'none',
  },
  accounts: {
    label: 'Chart of Accounts',
    href: '/dashboard/accounts',
    canDuplicate: false,
    periodKind: 'none',
  },
  'bank-import': {
    label: 'Bank Import',
    href: '/dashboard/statement-imports',
    canDuplicate: false,
    periodKind: 'none',
  },
  kevin: {
    label: 'Kevin',
    href: '/dashboard/kevin',
    canDuplicate: false,
    periodKind: 'none',
  },
};

const STORAGE_KEY = 'report-workspace-tabs';
const DEFAULT_PERIOD_KEY = 'report-default-period';

const DEFAULT_PERIOD: DefaultPeriod = { mode: 'previous_month' };

type ReportTabsContextValue = {
  tabs: ReportTab[];
  activeTabId: string | null;
  openTab: (
    type: ReportTabType,
    options?: {
      forceNew?: boolean;
      params?: Record<string, string | null | undefined>;
    },
  ) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  setActiveTab: (id: string) => void;
  defaultPeriod: DefaultPeriod;
  setDefaultPeriod: (next: DefaultPeriod) => void;
  tabDefinitions: typeof TAB_DEFINITIONS;
};

const ReportTabsContext = createContext<ReportTabsContextValue | null>(null);

function parseStoredTabs(): { tabs: ReportTab[]; activeTabId: string | null } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tabs)) {
      const normalizedTabs = (parsed.tabs as ReportTab[]).map((tab) => {
        if (TAB_DEFINITIONS[tab.type]?.canDuplicate && tab.id === 'default') {
          return { ...tab, id: `${tab.type}-default` };
        }
        return tab;
      });

      const seen = new Set<string>();
      const dedupedTabs = normalizedTabs.filter((tab) => {
        if (seen.has(tab.id)) return false;
        seen.add(tab.id);
        return true;
      });

      let activeTabId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null;

      if (activeTabId === 'default') {
        const fallback = dedupedTabs.find((tab) => tab.id.endsWith('-default'));
        activeTabId = fallback?.id ?? null;
      }

      if (activeTabId && !dedupedTabs.some((tab) => tab.id === activeTabId)) {
        activeTabId = dedupedTabs[0]?.id ?? null;
      }

      return {
        tabs: dedupedTabs,
        activeTabId,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function parseStoredDefaultPeriod(): DefaultPeriod {
  if (typeof window === 'undefined') return DEFAULT_PERIOD;
  try {
    const raw = window.localStorage.getItem(DEFAULT_PERIOD_KEY);
    if (!raw) return DEFAULT_PERIOD;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.mode === 'string') {
      return {
        mode: parsed.mode as DefaultPeriodMode,
        customFrom: typeof parsed.customFrom === 'string' ? parsed.customFrom : undefined,
        customTo: typeof parsed.customTo === 'string' ? parsed.customTo : undefined,
      };
    }
  } catch {
    // ignore
  }
  return DEFAULT_PERIOD;
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function resolveDefaultPeriod(
  period: DefaultPeriod,
  today: Date,
): { from: string; to: string; asOf: string } {
  if (period.mode === 'custom') {
    const fallback = resolveDefaultPeriod({ mode: 'previous_month' }, today);
    const from = period.customFrom || fallback.from;
    const to = period.customTo || fallback.to;
    return { from, to, asOf: to };
  }

  if (period.mode === 'current_month') {
    const from = startOfMonth(today);
    return {
      from: formatDateInputValue(from),
      to: formatDateInputValue(today),
      asOf: formatDateInputValue(today),
    };
  }

  if (period.mode === 'year_to_date') {
    const from = new Date(today.getFullYear(), 0, 1);
    return {
      from: formatDateInputValue(from),
      to: formatDateInputValue(today),
      asOf: formatDateInputValue(today),
    };
  }

  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const from = startOfMonth(previousMonth);
  const to = endOfMonth(previousMonth);
  return {
    from: formatDateInputValue(from),
    to: formatDateInputValue(to),
    asOf: formatDateInputValue(to),
  };
}

function getDefaultParamsForType(
  type: ReportTabType,
  period: DefaultPeriod,
): Record<string, string> {
  const resolved = resolveDefaultPeriod(period, new Date());
  const config = TAB_DEFINITIONS[type];

  if (config.periodKind === 'asOf') {
    return { asOf: resolved.asOf };
  }

  if (config.periodKind === 'range') {
    return { from: resolved.from, to: resolved.to };
  }

  return {};
}

function buildTabHref(
  type: ReportTabType,
  id: string,
  period: DefaultPeriod,
  paramsOverride?: Record<string, string | null | undefined>,
): string {
  const config = TAB_DEFINITIONS[type];
  const params = new URLSearchParams();

  if (config.canDuplicate) {
    params.set('instance', id);
  }

  const defaults = getDefaultParamsForType(type, period);
  Object.entries(defaults).forEach(([key, value]) => {
    params.set(key, value);
  });

  if (paramsOverride) {
    Object.entries(paramsOverride).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  }

  const query = params.toString();
  return query ? `${config.href}?${query}` : config.href;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function matchTabType(pathname: string): ReportTabType | null {
  const entries = Object.entries(TAB_DEFINITIONS) as Array<[ReportTabType, TabDefinition]>;

  for (const [type, def] of entries) {
    if (pathname.startsWith(def.href)) {
      return type;
    }
  }
  return null;
}

export function ReportTabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();

  const [tabs, setTabs] = useState<ReportTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [defaultPeriod, setDefaultPeriodState] = useState<DefaultPeriod>(DEFAULT_PERIOD);

  useEffect(() => {
    const stored = parseStoredTabs();
    if (stored?.tabs?.length) {
      setTabs((prev) => (prev.length === 0 ? stored.tabs : prev));
      setActiveTabId((prev) => prev ?? stored.activeTabId ?? null);
    }

    setDefaultPeriodState(parseStoredDefaultPeriod());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeTabId }));
    } catch {
      // ignore
    }
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DEFAULT_PERIOD_KEY, JSON.stringify(defaultPeriod));
    } catch {
      // ignore
    }
  }, [defaultPeriod]);

  useEffect(() => {
    const type = matchTabType(pathname);
    if (!type) return;

    const config = TAB_DEFINITIONS[type];
    const params = new URLSearchParams(searchParamsKey);
    const instanceParam = config.canDuplicate ? params.get('instance') : null;
    const defaultId = `${type}-default`;
    const instance = config.canDuplicate
      ? instanceParam === 'default'
        ? defaultId
        : instanceParam || defaultId
      : type;

    const query = searchParamsKey;
    const href = query ? `${pathname}?${query}` : pathname;

    setTabs((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.type === type && tab.id === instance);
      if (existingIndex >= 0) {
        const existing = prev[existingIndex]!;
        if (existing.href === href) {
          return prev;
        }
        const next = [...prev];
        next[existingIndex] = { ...existing, href };
        return next;
      }
      return [...prev, { id: instance, type, href }];
    });

    setActiveTabId(instance);
  }, [pathname, searchParamsKey]);

  const openTab = (
    type: ReportTabType,
    options?: {
      forceNew?: boolean;
      params?: Record<string, string | null | undefined>;
    },
  ) => {
    const config = TAB_DEFINITIONS[type];
    const forceNew = options?.forceNew === true && config.canDuplicate;

    if (!forceNew) {
      const activeOfType = activeTabId
        ? tabs.find((tab) => tab.id === activeTabId && tab.type === type)
        : null;
      const existing = activeOfType ?? tabs.find((tab) => tab.type === type);
      if (existing) {
        setActiveTabId(existing.id);
        router.push(existing.href);
        return;
      }
    }

    const id = config.canDuplicate ? (forceNew ? createId() : `${type}-default`) : type;
    const href = buildTabHref(type, id, defaultPeriod, options?.params);
    setTabs((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.id === id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { id, type, href };
        return next;
      }
      return [...prev, { id, type, href }];
    });
    setActiveTabId(id);
    router.push(href);
  };

  const closeTab = (id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;

    const nextTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(nextTabs);

    if (id === activeTabId) {
      const fallback = nextTabs[index - 1] || nextTabs[index] || null;
      if (fallback) {
        setActiveTabId(fallback.id);
        router.push(fallback.href);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const closeAllTabs = () => {
    setTabs([]);
    setActiveTabId(null);
    router.push('/dashboard/workspace');
  };

  const setActiveTab = (id: string) => {
    const tab = tabs.find((item) => item.id === id);
    if (tab) {
      setActiveTabId(id);
      router.push(tab.href);
    }
  };

  const value = useMemo(
    () => ({
      tabs,
      activeTabId,
      openTab,
      closeTab,
      closeAllTabs,
      setActiveTab,
      defaultPeriod,
      setDefaultPeriod: setDefaultPeriodState,
      tabDefinitions: TAB_DEFINITIONS,
    }),
    [tabs, activeTabId, defaultPeriod],
  );

  return <ReportTabsContext.Provider value={value}>{children}</ReportTabsContext.Provider>;
}

export function useReportTabs() {
  const context = useContext(ReportTabsContext);
  if (!context) {
    throw new Error('useReportTabs must be used within ReportTabsProvider');
  }
  return context;
}
