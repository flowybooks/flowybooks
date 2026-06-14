'use client';

type Props = {
  action: (formData: FormData) => void;
};

export function OpeningBalanceCsvForm({ action }: Props) {
  return (
    <form action={action} className="space-y-4 border rounded-md p-4 bg-card">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">As-of date</label>
          <input
            name="asOfDate"
            type="date"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Books start date</label>
          <input
            name="booksStartDate"
            type="date"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <input
            name="description"
            type="text"
            placeholder="Opening balance entry"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Opening balance CSV</label>
        <input
          name="file"
          type="file"
          accept=".csv"
          required
          className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-input file:bg-background file:text-sm file:font-medium"
        />
        <p className="text-xs text-muted-foreground">
          Required columns: Account Code, Debit, Credit. Optional: Description.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
        >
          Upload CSV
        </button>
      </div>
    </form>
  );
}
