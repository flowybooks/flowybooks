import type { StatementType } from './extractors/schemas';
import type { StatementImport } from '@/lib/db/schema';

type Tx = {
  description: string;
  rawDescription: string;
  amountCents: number;
  checkNumber?: string | null | undefined;
  date: string;
};

const PAYMENT_KEYWORDS = [
  'payment',
  'pmt',
  'paid',
  'paymt',
  'bill pay',
  'autopay',
  'auto pay',
  'io autopay',
];
const REFUND_KEYWORDS = ['refund', 'reversal', 'reversed', 'credit', 'adj'];
const INTEREST_CHARGE_KEYWORDS = ['interest charged', 'interest charge'];

function normalizeForKeywordMatching(description?: string | null) {
  return (description ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikePaymentOrRefund(description?: string | null) {
  const lower = normalizeForKeywordMatching(description);
  if (!lower) return false;
  return (
    PAYMENT_KEYWORDS.some((k) => lower.includes(k)) ||
    REFUND_KEYWORDS.some((k) => lower.includes(k))
  );
}

function looksLikeInterestCharge(description?: string | null) {
  const lower = normalizeForKeywordMatching(description);
  if (!lower) return false;

  if (INTEREST_CHARGE_KEYWORDS.some((k) => lower.includes(k))) {
    return true;
  }

  // Some statements split words or include extra punctuation.
  // Example: "INTEREST CHARGE ON PAY OVER TIME PURCHASES"
  return lower.includes('interest') && (lower.includes('charged') || lower.includes('charge'));
}

export function normalizeTransactionAmountsForStatementType(
  txs: Tx[],
  statementType: StatementType | StatementImport['statementType'],
) {
  return txs.map((tx) => {
    const interestChargeLike =
      looksLikeInterestCharge(tx.description) || looksLikeInterestCharge(tx.rawDescription);

    if (interestChargeLike) {
      return { ...tx, amountCents: -Math.abs(tx.amountCents) };
    }

    if (statementType === 'credit_card_statement') {
      const paymentLike =
        looksLikePaymentOrRefund(tx.description) || looksLikePaymentOrRefund(tx.rawDescription);

      // Payments/credits -> positive; otherwise preserve original sign
      if (paymentLike) {
        return { ...tx, amountCents: Math.abs(tx.amountCents) };
      }
    }

    return { ...tx, amountCents: tx.amountCents };
  });
}
