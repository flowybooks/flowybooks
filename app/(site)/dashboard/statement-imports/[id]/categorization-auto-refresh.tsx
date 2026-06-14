'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function CategorizationAutoRefresh(props: {
  enabled: boolean;
  intervalMs?: number;
  maxMs?: number;
}) {
  const router = useRouter();
  const intervalMs = props.intervalMs ?? 2000;
  const maxMs = props.maxMs ?? 60_000;

  useEffect(() => {
    if (!props.enabled) return;

    const startedAt = Date.now();
    const intervalId = setInterval(() => {
      if (Date.now() - startedAt > maxMs) {
        clearInterval(intervalId);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [props.enabled, intervalMs, maxMs, router]);

  return null;
}
