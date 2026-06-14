export type JournalLineAmounts = {
  debit: number;
  credit: number;
};

export type JournalTotals = {
  totalDebit: number;
  totalCredit: number;
};

export function calculateJournalTotals(lines: JournalLineAmounts[]): JournalTotals {
  return lines.reduce<JournalTotals>(
    (totals, line) => {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;

      return {
        totalDebit: totals.totalDebit + (debit > 0 ? debit : 0),
        totalCredit: totals.totalCredit + (credit > 0 ? credit : 0),
      };
    },
    { totalDebit: 0, totalCredit: 0 },
  );
}

export function canPostJournal(lines: JournalLineAmounts[]): boolean {
  if (lines.length === 0) {
    return false;
  }

  for (const line of lines) {
    const debit = line.debit ?? 0;
    const credit = line.credit ?? 0;

    if (debit < 0 || credit < 0) {
      return false;
    }

    if (debit > 0 && credit > 0) {
      return false;
    }

    if (debit === 0 && credit === 0) {
      return false;
    }
  }

  const { totalDebit, totalCredit } = calculateJournalTotals(lines);

  if (totalDebit === 0 || totalCredit === 0) {
    return false;
  }

  return totalDebit === totalCredit;
}
