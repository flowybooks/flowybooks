import React from 'react';

export default function JournalImportPage() {
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Journals (CSV)</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Upload a CSV file with columns:&nbsp;
          <code>
            GLDate, Narration, Description, GLAccount, Debit, Credit, Tag1, Tag2, Tag3, Tag4, Tag5
          </code>
          . All journals must be balanced per narration and overall. The file will be imported as
          draft journals.
        </p>
      </div>

      <form
        action="/api/journals/import-csv"
        method="POST"
        encType="multipart/form-data"
        className="space-y-4 border rounded-md p-4 bg-card"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="file">
            CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv"
            required
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          Upload CSV
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        After upload, you will see a JSON response with the created batches and totals.
      </p>
    </div>
  );
}
