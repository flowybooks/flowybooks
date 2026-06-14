'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type StatementImportUploadResponse = {
  error?: unknown;
  importId?: unknown;
};

export default function NewStatementImportPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [statementType, setStatementType] = useState<'bank_statement' | 'credit_card_statement'>(
    'bank_statement',
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPhase('uploading');

    const formData = new FormData(e.currentTarget);
    const files = formData.getAll('file').filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      setError('Please select at least one file');
      setPhase('idle');
      return;
    }

    try {
      const importBatchId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      for (const file of files) {
        const fileFormData = new FormData();
        fileFormData.append('file', file);
        fileFormData.append('statementType', statementType);
        fileFormData.append('importBatchId', importBatchId);

        const response = await fetch('/api/statement-imports', {
          method: 'POST',
          body: fileFormData,
        });

        const contentType = response.headers.get('content-type') ?? '';
        let data: StatementImportUploadResponse | null = null;

        if (contentType.includes('application/json')) {
          try {
            const parsed: unknown = await response.json();
            data =
              parsed && typeof parsed === 'object'
                ? (parsed as StatementImportUploadResponse)
                : null;
          } catch {
            // Ignore JSON parse errors; we'll fall back to a generic message below.
          }
        }

        if (!response.ok) {
          const message =
            data && typeof data === 'object' && typeof data.error === 'string'
              ? data.error
              : `Upload failed (status ${response.status})`;
          throw new Error(message);
        }

        if (!data || typeof data.importId !== 'string') {
          throw new Error('Upload succeeded but response was invalid');
        }
      }

      // Redirect back to the imports list. Extraction is started automatically from that page.
      router.push('/dashboard/statement-imports');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPhase('idle');
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Upload Statement</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Upload a bank or credit card statement (PDF or CSV). We&apos;ll extract transactions
          automatically.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 border rounded-md p-4 bg-card">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="file">
            Statement file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            multiple
            required
            disabled={phase !== 'idle'}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Max file size: PDFs up to 10MB, CSVs up to 5MB.
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Statement type</span>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="statementType"
                value="bank_statement"
                checked={statementType === 'bank_statement'}
                onChange={() => setStatementType('bank_statement')}
                required
                disabled={phase !== 'idle'}
              />
              Bank
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="statementType"
                value="credit_card_statement"
                checked={statementType === 'credit_card_statement'}
                onChange={() => setStatementType('credit_card_statement')}
                required
                disabled={phase !== 'idle'}
              />
              Credit card
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Required. Determines how amounts are interpreted (credit cards: purchases negative,
            payments positive).
          </p>
        </div>

        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={phase !== 'idle'}
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
        >
          {phase === 'uploading' ? 'Uploading...' : 'Upload Statement'}
        </button>
      </form>
    </div>
  );
}
