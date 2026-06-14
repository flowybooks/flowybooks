import { createHash } from 'crypto';

/**
 * Hash Utilities for Deduplication
 *
 * These functions create deterministic hashes for detecting duplicate data.
 * Used primarily for preventing duplicate journal batch imports.
 */

/**
 * Creates a SHA-256 hash of any JSON-serializable value.
 * The output is a 64-character hex string.
 *
 * @param value - Any JSON-serializable value (object, array, string, number, etc.)
 * @returns A 64-character hex string
 *
 * @example
 * hashJsonValue({ amount: 100, date: '2024-01-15' })
 * // => 'a1b2c3d4...' (64 chars)
 */
function normalizeForHash(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item));
  }

  if (typeof value === 'object') {
    const recordValue = value as Record<string, unknown>;
    const sortedKeys = Object.keys(recordValue).sort();
    const normalizedRecord: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      normalizedRecord[key] = normalizeForHash(recordValue[key]);
    }
    return normalizedRecord;
  }

  return value;
}

export function hashJsonValue(value: unknown): string {
  const serialized = JSON.stringify(normalizeForHash(value));
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * Creates a hash for a statement import's parsed transactions.
 * This allows detecting if the same CSV/PDF has been imported before.
 *
 * @param transactions - Array of transaction objects
 * @returns A 64-character hex string
 *
 * @example
 * const hash = hashTransactions([
 *   { date: '2024-01-15', description: 'Vendor Corp', amount: -5000 },
 *   { date: '2024-01-16', description: 'Deposit', amount: 10000 },
 * ]);
 */
export function hashTransactions(
  transactions: Array<{
    transactionDate: Date | string;
    description: string;
    amountCents: number;
  }>,
): string {
  // Normalize and sort transactions for consistent hashing
  const normalized = transactions
    .map((tx) => ({
      date:
        tx.transactionDate instanceof Date
          ? (tx.transactionDate.toISOString().split('T')[0] ?? '')
          : (String(tx.transactionDate).split('T')[0] ?? ''),
      desc: tx.description.trim().toLowerCase(),
      amount: tx.amountCents,
    }))
    .sort((a, b) => {
      // Sort by date, then description, then amount
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.desc !== b.desc) return a.desc.localeCompare(b.desc);
      return a.amount - b.amount;
    });

  return hashJsonValue(normalized);
}

/**
 * Creates a hash for a journal batch's source reference.
 * Used to detect if the same journal batch has been created before.
 *
 * @param sourceType - Type of source (e.g., 'statement_import', 'manual', 'csv_import')
 * @param sourceRef - Reference data specific to the source type
 * @returns A 64-character hex string
 */
export function hashJournalSource(sourceType: string, sourceRef: unknown): string {
  return hashJsonValue({ type: sourceType, ref: sourceRef });
}

/**
 * Creates a short hash (16 characters) for display purposes.
 * Not suitable for cryptographic use, but useful for UI display.
 *
 * @param value - Any JSON-serializable value
 * @returns A 16-character hex string
 */
export function shortHash(value: unknown): string {
  return hashJsonValue(value).slice(0, 16);
}
