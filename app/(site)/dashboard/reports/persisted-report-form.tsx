'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type PersistedReportFormProps = React.FormHTMLAttributes<HTMLFormElement> & {
  storageKey: string;
  paramNames: string[];
};

const parseSaved = (storageKey: string): Record<string, string> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // ignore malformed storage
  }
  return null;
};

function isIsoDateValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function PersistedReportForm({
  storageKey,
  paramNames,
  children,
  onSubmit,
  ...formProps
}: PersistedReportFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();

  // If params are missing, restore them from storage and replace URL so the server re-renders with persisted dates.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const existingParams = new URLSearchParams(window.location.search);
    const existingKeys = Array.from(new Set(existingParams.keys()));
    const isBareNavigation =
      existingKeys.length === 0 || (existingKeys.length === 1 && existingKeys[0] === 'instance');
    if (!isBareNavigation) {
      return;
    }

    const saved = parseSaved(storageKey);
    if (!saved) return;

    const missing = paramNames.filter((key) => !searchParams.get(key));
    if (missing.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    let didUpdate = false;

    missing.forEach((key) => {
      const value = saved[key];
      if (typeof value !== 'string' || !value) return;

      if ((key === 'from' || key === 'to' || key === 'asOf') && !isIsoDateValue(value)) {
        return;
      }

      params.set(key, value);
      didUpdate = true;
    });

    if (!didUpdate) return;

    const next = `${pathname}?${params.toString()}`;
    if (next !== window.location.pathname + window.location.search) {
      router.replace(next);
    }
  }, [paramNames, router, searchParamsKey, storageKey, pathname]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    onSubmit?.(event);
    if (event.defaultPrevented) return;

    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    const params = new URLSearchParams();

    formData.forEach((value, key) => {
      if (typeof value === 'string' && value) {
        params.set(key, value);
      }
    });

    paramNames.forEach((key) => {
      const value = formData.get(key);
      if (typeof value === 'string' && value) {
        payload[key] = value;
      }
    });

    if (typeof window !== 'undefined' && Object.keys(payload).length > 0) {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // ignore storage errors
      }
    }

    const query = params.toString();
    const next = query ? `${pathname}?${query}` : pathname;
    router.push(next);
  };

  return (
    <form {...formProps} onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
