'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postTransactionsToJournal } from '../actions';

interface Props {
  importId: string;
  canPost: boolean;
  postableCount: number;
}

export function PostButton({ importId, canPost, postableCount }: Props) {
  const router = useRouter();
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handlePost() {
    setIsPosting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await postTransactionsToJournal(importId);
      // Refresh to show updated status
      router.refresh();
      setSuccess(`Posted ${result.transactionCount} transactions to journal.`);
      setIsPosting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
      setIsPosting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      {success && <span className="text-sm text-green-600">{success}</span>}
      <button
        onClick={handlePost}
        disabled={!canPost || isPosting}
        className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPosting ? 'Posting...' : `Post ${postableCount} to Journal`}
      </button>
    </div>
  );
}
