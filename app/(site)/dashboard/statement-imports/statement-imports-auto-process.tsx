'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';

type ImportStatus = 'uploaded' | 'extracting' | 'extracted' | 'imported' | 'failed' | string;

export function StatementImportsAutoProcess(props: {
  imports: Array<{ id: string; status: ImportStatus }>;
  aiEnabled: boolean;
  intervalMs?: number;
  maxMs?: number;
}) {
  const router = useRouter();
  const intervalMs = props.intervalMs ?? 2000;
  const maxMs = props.maxMs ?? 10 * 60_000;

  const attemptedIdsRef = useRef<Set<string>>(new Set());
  const refreshStartedAtRef = useRef<number | null>(null);

  const { uploadedIds, hasExtracting, shouldRefresh } = useMemo(() => {
    const uploadedIds = props.imports
      .filter((imp) => imp.status === 'uploaded')
      .map((imp) => imp.id);

    const hasExtracting = props.imports.some((imp) => imp.status === 'extracting');

    const shouldRefresh = props.imports.some((imp) =>
      props.aiEnabled
        ? imp.status === 'uploaded' || imp.status === 'extracting'
        : imp.status === 'extracting',
    );

    return { uploadedIds, hasExtracting, shouldRefresh };
  }, [props.aiEnabled, props.imports]);

  useEffect(() => {
    if (!shouldRefresh) {
      refreshStartedAtRef.current = null;
      return;
    }

    refreshStartedAtRef.current ??= Date.now();

    const intervalId = setInterval(() => {
      if (!refreshStartedAtRef.current) return;
      if (Date.now() - refreshStartedAtRef.current > maxMs) {
        clearInterval(intervalId);
        return;
      }
      router.refresh();
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [intervalMs, maxMs, router, shouldRefresh]);

  useEffect(() => {
    if (!props.aiEnabled || hasExtracting) return;

    const nextId = uploadedIds.find((id) => !attemptedIdsRef.current.has(id));
    if (!nextId) return;

    attemptedIdsRef.current.add(nextId);

    void (async () => {
      try {
        await fetch(`/api/statement-imports/${nextId}/extract`, { method: 'POST' });
      } finally {
        router.refresh();
      }
    })();
  }, [hasExtracting, props.aiEnabled, uploadedIds, router]);

  return null;
}
