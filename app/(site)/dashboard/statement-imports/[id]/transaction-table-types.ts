export interface Transaction {
  id: string;
  lineNumber: number;
  transactionDate: Date;
  description: string;
  rawDescription: string;
  amountCents: number;
  checkNumber: string | null;
  suggestedAccountId: string | null;
  categoryConfidence: string | null;
  confirmedAccountId: string | null;
  allocations: Array<{ accountId: string; amountCents: number }> | null;
  isExcluded: boolean;
  journalBatchId?: string | null;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export type TransactionStatus = 'posted' | 'categorized' | 'uncategorized' | 'excluded';
