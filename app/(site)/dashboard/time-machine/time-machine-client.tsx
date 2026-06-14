'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, History, RefreshCw, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TimeMachineEntry } from '@/lib/accounting/time-machine-service';

type TimeMachineClientProps = {
  initialEntries: TimeMachineEntry[];
};

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusTone(entry: TimeMachineEntry): string {
  if (entry.canRestore) {
    return 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/70 dark:bg-emerald-950/30 dark:text-emerald-200';
  }
  return 'border-border bg-background text-muted-foreground';
}

function entryIcon(entry: TimeMachineEntry) {
  if (entry.kind === 'restore_safety') return <RotateCcw className="size-4" />;
  return <Clock3 className="size-4" />;
}

export function TimeMachineClient({ initialEntries }: TimeMachineClientProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [selectedEntryId, setSelectedEntryId] = useState(initialEntries[0]?.entryId ?? null);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.entryId === selectedEntryId) ?? entries[0] ?? null,
    [entries, selectedEntryId],
  );

  const restorableCount = entries.filter((entry) => entry.canRestore).length;

  async function refreshEntries() {
    const response = await fetch('/api/time-machine');
    if (!response.ok) return;
    const body = (await response.json()) as { entries: TimeMachineEntry[] };
    setEntries(body.entries);
    setSelectedEntryId((current) =>
      current && body.entries.some((entry) => entry.entryId === current)
        ? current
        : (body.entries[0]?.entryId ?? null),
    );
  }

  async function runAction(entry: TimeMachineEntry | null, operation: 'snapshot' | 'restore') {
    const entryId = entry?.entryId ?? 'manual-snapshot';

    if (
      operation === 'restore' &&
      entry &&
      !window.confirm(
        `Restore "${entry.title}"? This replaces the current org bookkeeping state. A safety checkpoint will be created first.`,
      )
    ) {
      return;
    }

    setBusyEntryId(entryId);
    setError(null);

    try {
      const response = await fetch('/api/time-machine/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: entry?.entryId, operation }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok || body.error) {
        throw new Error(body.error ?? `Unable to ${operation}`);
      }
      await refreshEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to ${operation}`);
    } finally {
      setBusyEntryId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <History className="size-6" />
            Time Machine
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Timestamped local checkpoints that can restore the org database state.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyEntryId === 'manual-snapshot'}
            onClick={() => runAction(null, 'snapshot')}
          >
            <Clock3 className="size-4" />
            Create Checkpoint
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={refreshEntries}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Checkpoints</h2>
              <p className="text-xs text-muted-foreground">
                {entries.length} recent checkpoint{entries.length === 1 ? '' : 's'} ·{' '}
                {restorableCount} restorable
              </p>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No checkpoints have been recorded yet.
            </div>
          ) : (
            <div className="divide-y">
              {entries.map((entry) => {
                const selected = selectedEntry?.entryId === entry.entryId;
                const busy = busyEntryId === entry.entryId;
                return (
                  <div
                    key={entry.entryId}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedEntryId(entry.entryId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedEntryId(entry.entryId);
                      }
                    }}
                    className={`grid w-full gap-3 px-4 py-3 text-left transition hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto] ${
                      selected ? 'bg-muted/50' : ''
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`inline-flex size-8 shrink-0 items-center justify-center border ${statusTone(
                            entry,
                          )}`}
                        >
                          {entryIcon(entry)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{entry.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {entry.description}
                          </span>
                        </span>
                      </span>
                      <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{entry.kind === 'restore_safety' ? 'Safety' : 'Checkpoint'}</span>
                        <span>status: {entry.status}</span>
                        <span>recorded: {formatDateTime(entry.createdAt)}</span>
                      </span>
                    </span>

                    <span className="flex items-center gap-2 sm:justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || !entry.canRestore}
                        onClick={(event) => {
                          event.stopPropagation();
                          runAction(entry, 'restore');
                        }}
                        title="Restore this checkpoint"
                      >
                        <RotateCcw className="size-4" />
                        Restore
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="border bg-background p-4">
            <h2 className="text-sm font-semibold">Selected Checkpoint</h2>
            {selectedEntry ? (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 size-4" />
                  <span>{selectedEntry.title}</span>
                </div>
                <dl className="space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd>{selectedEntry.kind === 'restore_safety' ? 'Safety' : 'Checkpoint'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Recorded</dt>
                    <dd className="text-right">{formatDateTime(selectedEntry.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>{selectedEntry.status}</dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={busyEntryId === selectedEntry.entryId || !selectedEntry.canRestore}
                  onClick={() => runAction(selectedEntry, 'restore')}
                >
                  <RotateCcw className="size-4" />
                  Restore Checkpoint
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No checkpoint selected.</p>
            )}
          </div>

          <div className="border bg-muted/20 p-4 text-xs leading-5 text-muted-foreground">
            Restore replaces org-scoped bookkeeping/workflow rows from the saved checkpoint. Users,
            memberships, audit logs, and Time Machine checkpoints are preserved.
          </div>
        </aside>
      </div>
    </div>
  );
}
