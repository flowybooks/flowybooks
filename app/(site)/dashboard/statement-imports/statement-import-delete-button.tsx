'use client';

import { useTransition } from 'react';
import { deleteStatementImportForCurrentTeam } from './actions';

type Props = {
  importId: string;
};

export function StatementImportDeleteButton({ importId }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm('Delete this duplicate import? This cannot be undone.')) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteStatementImportForCurrentTeam(importId);
      } catch (error) {
        console.error(error);
        alert(error instanceof Error ? error.message : 'Failed to delete import');
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
