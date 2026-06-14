'use client';

import React, { useState } from 'react';

export default function AccountsImportCsvPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<unknown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch('/api/accounts/import-csv', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data?.error === 'string'
            ? data.error
            : Array.isArray(data?.errors) && data.errors.length > 0
              ? String(data.errors[0])
              : 'Failed to import CoA CSV';
        setError(message);
      } else {
        setResult(data);
      }
    } catch {
      setError('Failed to import CoA CSV');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Import Chart of Accounts (CSV)</h1>
        <p className="text-sm text-muted-foreground">
          Upload a CSV file to create or update your Chart of Accounts for the current organization.
          The import runs as a single transaction; if any row fails validation, nothing is applied.
        </p>
        <p className="text-sm text-muted-foreground">
          Required columns: <code>Code</code>, <code>Name</code>, <code>Type</code>,{' '}
          <code>Classification</code>. <code>Code</code> must be unique per org and contain no
          spaces.
        </p>
        <ul className="text-sm text-muted-foreground list-disc pl-6 space-y-1">
          <li>
            Rows upsert by <code>Code</code>: new codes create accounts; existing codes update name,
            type, and classification.
          </li>
          <li>
            Accounts with journal activity cannot change type or classification; mismatches will
            fail the import.
          </li>
          <li>
            Accounts missing from the file are deactivated (set inactive). This does not require
            removing historical activity.
          </li>
          <li>
            Protected system accounts (Retained Earnings, Opening Balance Equity, Prior Period
            Adjustments) stay active even if missing from the file, cannot be removed or renamed,
            and Retained Earnings must remain present.
          </li>
        </ul>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Classification → Type mapping</h2>
        <p className="text-sm text-muted-foreground">
          Each classification implies a specific high-level account type. When both{' '}
          <code>Type</code> and <code>Classification</code> are provided in a row, they must match
          this mapping:
        </p>
        <ul className="text-sm text-muted-foreground list-disc pl-6 space-y-1">
          <li>
            <strong>
              Asset classifications (Type = <code>asset</code>)
            </strong>
            : <code>current_asset</code>, <code>noncurrent_asset</code>, <code>fixed_asset</code>,{' '}
            <code>other_asset</code>
          </li>
          <li>
            <strong>
              Liability classifications (Type = <code>liability</code>)
            </strong>
            : <code>current_liability</code>, <code>noncurrent_liability</code>,{' '}
            <code>other_liability</code>
          </li>
          <li>
            <strong>
              Equity classifications (Type = <code>equity</code>)
            </strong>
            : <code>equity</code>, <code>common_stock</code>,{' '}
            <code>additional_paid_in_capital</code>, <code>treasury_stock</code>,{' '}
            <code>retained_earnings</code>, <code>dividends_equity</code>,{' '}
            <code>foreign_currency_translation</code>, <code>preferred_stock</code>,{' '}
            <code>other_equity</code>
          </li>
          <li>
            <strong>
              Income classifications (Type = <code>income</code>)
            </strong>
            : <code>income</code>, <code>interest_income</code>, <code>dividend_income</code>,{' '}
            <code>other_income</code>, <code>sales</code>
          </li>
          <li>
            <strong>
              Expense classifications (Type = <code>expense</code>)
            </strong>
            : <code>expense</code>, <code>operating_expense</code>, <code>cogs</code>,{' '}
            <code>other_expense</code>, <code>depreciation</code>, <code>fixed_costs</code>,{' '}
            <code>variable_expenses</code>
          </li>
        </ul>
      </section>

      <section className="space-y-4 border rounded-md p-4 bg-card">
        <h2 className="text-sm font-semibold">Upload CSV</h2>
        <p className="text-xs text-muted-foreground">
          This will call <code>/api/accounts/import-csv</code> and apply all valid changes in a
          single transaction. On error, no changes are applied.
        </p>
        <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="file">
              CoA CSV file
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv"
              required
              disabled={isSubmitting}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-50"
          >
            {isSubmitting ? 'Uploading...' : 'Upload CoA CSV'}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result !== null && !error && (
          <div className="rounded-md border border-muted bg-muted/30 p-3">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">API response</h3>
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
