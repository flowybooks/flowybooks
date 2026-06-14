'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  importId: string;
}

export function ExtractButton({ importId }: Props) {
  const router = useRouter();
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExtract() {
    setIsExtracting(true);
    setError(null);

    try {
      const response = await fetch(`/api/statement-imports/${importId}/extract`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Extraction failed');
      }

      // Refresh the page to show extracted transactions
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setIsExtracting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button
        onClick={handleExtract}
        disabled={isExtracting}
        className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
      >
        {isExtracting ? 'Extracting...' : 'Extract'}
      </button>
    </div>
  );
}
