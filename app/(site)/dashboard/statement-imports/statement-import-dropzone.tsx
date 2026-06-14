'use client';

import { useRef, useState, useId, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCEPTED_TYPES = '.pdf,.csv,application/pdf,text/csv';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Props {
  statementAccounts: Account[];
}

type StatementImportUploadResponse = {
  error?: unknown;
  importId?: unknown;
};

export function StatementImportDropzone({ statementAccounts }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statementType, setStatementType] = useState<'bank_statement' | 'credit_card_statement'>(
    'bank_statement',
  );

  const selectId = useId();

  function generateBatchId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function uploadFile(file: File, batchId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('statementType', statementType);
    formData.append('importBatchId', batchId);
    if (selectedAccountId) {
      formData.append('linkedAccountId', selectedAccountId);
    }

    try {
      const response = await fetch('/api/statement-imports', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type') ?? '';
      let data: StatementImportUploadResponse | null = null;

      if (contentType.includes('application/json')) {
        try {
          const parsed: unknown = await response.json();
          data =
            parsed && typeof parsed === 'object' ? (parsed as StatementImportUploadResponse) : null;
        } catch {
          // ignore JSON parse errors
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

      return data;
    } catch (err) {
      throw err;
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0 || phase !== 'idle') {
      return;
    }

    if (!selectedAccountId) {
      setError('Please select an account before uploading.');
      return;
    }

    setPhase('uploading');
    setError(null);

    // All files in this upload share the same batch ID
    const batchId = generateBatchId();

    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        await uploadFile(file, batchId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        failures.push(`${file.name}: ${message}`);
      }
    }

    if (failures.length > 0) {
      setError(failures.join('\n'));
    }

    setPhase('idle');
    router.refresh();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleBrowse() {
    if (phase === 'idle' && selectedAccountId) {
      inputRef.current?.click();
    }
  }

  const isDisabled = phase !== 'idle' || !selectedAccountId;

  return (
    <div className="border rounded-md p-4 bg-card space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-sm font-medium">
            Account
          </label>
          <select
            id={selectId}
            value={selectedAccountId}
            onChange={(e) => {
              setSelectedAccountId(e.target.value);
              setError(null);
            }}
            className="text-sm border rounded px-2 py-1.5 bg-background"
          >
            <option value="">Select account...</option>
            {statementAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="statement-type"
              checked={statementType === 'bank_statement'}
              onChange={() => setStatementType('bank_statement')}
              className="accent-foreground"
            />
            Bank
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="statement-type"
              checked={statementType === 'credit_card_statement'}
              onChange={() => setStatementType('credit_card_statement')}
              className="accent-foreground"
            />
            Credit Card
          </label>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={handleBrowse}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleBrowse();
          }
        }}
        onDragEnter={() => !isDisabled && setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={isDisabled ? undefined : handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 py-6 text-center transition',
          isDragging ? 'border-foreground bg-muted/40' : 'border-muted-foreground/40',
          isDisabled && 'cursor-not-allowed opacity-50',
        )}
        aria-disabled={isDisabled}
      >
        <UploadCloud className="h-5 w-5 text-muted-foreground" />
        <div className="text-sm font-medium">
          {selectedAccountId
            ? 'Drag and drop statements here'
            : 'Select an account to enable upload'}
        </div>
        <div className="text-xs text-muted-foreground">
          PDF up to 10MB, CSV up to 5MB. Upload multiple files at once.
        </div>
        {phase === 'uploading' && <div className="text-xs text-muted-foreground">Uploading...</div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        name="file"
        accept={ACCEPTED_TYPES}
        multiple
        onChange={(event) => {
          void handleFiles(event.target.files);
          if (event.target) {
            event.target.value = '';
          }
        }}
        className="hidden"
        disabled={isDisabled}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 whitespace-pre-wrap">
          {error}
        </div>
      )}
    </div>
  );
}
