'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { unpostStatementImport } from '../actions';

interface Props {
  importId: string;
  postedCount: number;
}

export function UnpostButton({ importId, postedCount }: Props) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnpost() {
    if (!confirm('Unpost this import? A reversing journal will be created.')) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      await unpostStatementImport(importId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unpost');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button
        type="button"
        onClick={handleUnpost}
        disabled={isWorking}
        className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {isWorking ? 'Unposting…' : `Unpost ${postedCount} transactions`}
      </button>
    </div>
  );
}
