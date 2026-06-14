import type { StatementType } from './extractors/schemas';

export type KevinStatementType = Extract<StatementType, 'bank_statement' | 'credit_card_statement'>;

export type StatementClassificationConfidence = 'high' | 'medium' | 'low';

export type StatementAccountCandidate = {
  id: string;
  code?: string | null;
  name: string;
  type?: string | null;
  classification?: string | null;
  isActive?: boolean | null;
  isStatementAccount?: boolean | null;
};

export type StatementClassification = {
  detectedStatementType: KevinStatementType;
  confidence: StatementClassificationConfidence;
  evidence: string[];
  suggestedLinkedAccountId: string | null;
  suggestedLinkedAccountCode: string | null;
  suggestedLinkedAccountName: string | null;
  accountMatchStatus: 'matched' | 'ambiguous' | 'none' | 'conflict';
  accountMatchReason: string;
  requiresConfirmation: boolean;
};

type ScoredClue = {
  pattern: RegExp;
  weight: number;
  evidence: string;
};

const CREDIT_CARD_CLUES: ScoredClue[] = [
  { pattern: /\bcredit\s+card\s+statement\b/i, weight: 8, evidence: 'credit card statement' },
  { pattern: /\bcardmember\b/i, weight: 6, evidence: 'cardmember language' },
  { pattern: /\bminimum\s+payment\b/i, weight: 6, evidence: 'minimum payment language' },
  { pattern: /\bpayment\s+due\s+date\b/i, weight: 5, evidence: 'payment due date' },
  { pattern: /\bnew\s+balance\b/i, weight: 4, evidence: 'new balance language' },
  { pattern: /\bcredit\s+limit\b/i, weight: 5, evidence: 'credit limit' },
  { pattern: /\bavailable\s+credit\b/i, weight: 5, evidence: 'available credit' },
  { pattern: /\binterest\s+charge\b/i, weight: 4, evidence: 'interest charge' },
  { pattern: /\b(apr|annual\s+percentage\s+rate)\b/i, weight: 4, evidence: 'APR language' },
  {
    pattern: /\b(rewards|cash\s+back|membership\s+rewards)\b/i,
    weight: 3,
    evidence: 'card rewards language',
  },
  {
    pattern: /\b(visa|mastercard|amex|american\s+express|discover)\b/i,
    weight: 4,
    evidence: 'card network or issuer clue',
  },
  {
    pattern: /\b(purchases|cash\s+advances|fees\s+charged)\b/i,
    weight: 3,
    evidence: 'card activity categories',
  },
];

const BANK_CLUES: ScoredClue[] = [
  { pattern: /\bbank\s+statement\b/i, weight: 8, evidence: 'bank statement' },
  { pattern: /\bchecking\s+account\b/i, weight: 7, evidence: 'checking account' },
  { pattern: /\bsavings\s+account\b/i, weight: 7, evidence: 'savings account' },
  { pattern: /\baccount\s+summary\b/i, weight: 3, evidence: 'account summary' },
  { pattern: /\bbeginning\s+balance\b/i, weight: 3, evidence: 'beginning balance' },
  { pattern: /\bending\s+balance\b/i, weight: 3, evidence: 'ending balance' },
  { pattern: /\b(deposits?|credits?)\b/i, weight: 4, evidence: 'deposit/credit language' },
  { pattern: /\b(withdrawals?|debits?)\b/i, weight: 4, evidence: 'withdrawal/debit language' },
  { pattern: /\bchecks?\s+(paid|number|no\.?)\b/i, weight: 4, evidence: 'check activity' },
  { pattern: /\bach\b/i, weight: 2, evidence: 'ACH activity' },
  { pattern: /\batm\b/i, weight: 2, evidence: 'ATM activity' },
];

const GENERIC_ACCOUNT_TOKENS = new Set([
  'account',
  'bank',
  'cash',
  'card',
  'credit',
  'checking',
  'savings',
  'payable',
  'liability',
  'asset',
  'statement',
  'business',
  'operating',
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreClues(text: string, clues: ScoredClue[]) {
  let score = 0;
  const evidence: string[] = [];

  for (const clue of clues) {
    if (clue.pattern.test(text)) {
      score += clue.weight;
      if (!evidence.includes(clue.evidence)) {
        evidence.push(clue.evidence);
      }
    }
  }

  return { score, evidence };
}

function confidenceFor(score: number, margin: number): StatementClassificationConfidence {
  if (score >= 9 && margin >= 4) return 'high';
  if (score >= 5 && margin >= 2) return 'medium';
  return 'low';
}

function expectedAccountType(statementType: KevinStatementType) {
  return statementType === 'credit_card_statement' ? 'liability' : 'asset';
}

function accountTokens(account: StatementAccountCandidate) {
  return normalizeText(`${account.code ?? ''} ${account.name}`)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_ACCOUNT_TOKENS.has(token));
}

function scoreAccountCandidate(
  account: StatementAccountCandidate,
  statementType: KevinStatementType,
  normalizedDocumentText: string,
) {
  let score = 0;
  const reasons: string[] = [];
  const expectedType = expectedAccountType(statementType);

  if (account.type === expectedType) {
    score += 4;
    reasons.push(`account type is ${expectedType}`);
  }

  if (account.isStatementAccount) {
    score += 2;
    reasons.push('account is marked as a statement account');
  }

  for (const token of accountTokens(account)) {
    if (normalizedDocumentText.includes(token)) {
      score += 2;
      reasons.push(`matched "${token}"`);
    }
  }

  const lastFour = normalizeText(account.name).match(/\b\d{4}\b/)?.[0];
  if (lastFour && normalizedDocumentText.includes(lastFour)) {
    score += 4;
    reasons.push(`matched account digits ${lastFour}`);
  }

  return { account, score, reasons };
}

function resolveSuggestedAccount(params: {
  statementType: KevinStatementType;
  confidence: StatementClassificationConfidence;
  accounts: StatementAccountCandidate[];
  normalizedDocumentText: string;
  linkedAccountId?: string | null | undefined;
}) {
  const { statementType, confidence, accounts, normalizedDocumentText, linkedAccountId } = params;
  const expectedType = expectedAccountType(statementType);
  const activeStatementAccounts = accounts.filter(
    (account) => account.isActive !== false && account.isStatementAccount,
  );
  const linkedAccount = linkedAccountId
    ? activeStatementAccounts.find((account) => account.id === linkedAccountId)
    : null;

  if (linkedAccount && linkedAccount.type !== expectedType) {
    return {
      suggestedLinkedAccountId: null,
      suggestedLinkedAccountCode: null,
      suggestedLinkedAccountName: null,
      accountMatchStatus: 'conflict' as const,
      accountMatchReason: `Selected account "${linkedAccount.name}" is a ${linkedAccount.type ?? 'unknown'} account, but ${statementType} expects ${expectedType}.`,
    };
  }

  if (linkedAccount) {
    return {
      suggestedLinkedAccountId: linkedAccount.id,
      suggestedLinkedAccountCode: linkedAccount.code ?? null,
      suggestedLinkedAccountName: linkedAccount.name,
      accountMatchStatus: 'matched' as const,
      accountMatchReason: `Selected linked account "${linkedAccount.name}" matches the detected statement type.`,
    };
  }

  if (confidence !== 'high') {
    return {
      suggestedLinkedAccountId: null,
      suggestedLinkedAccountCode: null,
      suggestedLinkedAccountName: null,
      accountMatchStatus: 'none' as const,
      accountMatchReason: 'Statement type confidence is not high enough to auto-link an account.',
    };
  }

  const candidates = activeStatementAccounts.filter((account) => account.type === expectedType);
  if (candidates.length === 0) {
    return {
      suggestedLinkedAccountId: null,
      suggestedLinkedAccountCode: null,
      suggestedLinkedAccountName: null,
      accountMatchStatus: 'none' as const,
      accountMatchReason: `No active ${expectedType} statement account is available to link.`,
    };
  }

  if (candidates.length === 1) {
    const account = candidates[0]!;
    return {
      suggestedLinkedAccountId: account.id,
      suggestedLinkedAccountCode: account.code ?? null,
      suggestedLinkedAccountName: account.name,
      accountMatchStatus: 'matched' as const,
      accountMatchReason: `Only one active ${expectedType} statement account is available.`,
    };
  }

  const scored = candidates
    .map((account) => scoreAccountCandidate(account, statementType, normalizedDocumentText))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;

  if (best && best.score >= 8 && (!second || best.score - second.score >= 3)) {
    return {
      suggestedLinkedAccountId: best.account.id,
      suggestedLinkedAccountCode: best.account.code ?? null,
      suggestedLinkedAccountName: best.account.name,
      accountMatchStatus: 'matched' as const,
      accountMatchReason: best.reasons.join('; ') || 'Best account match was unique.',
    };
  }

  return {
    suggestedLinkedAccountId: null,
    suggestedLinkedAccountCode: null,
    suggestedLinkedAccountName: null,
    accountMatchStatus: 'ambiguous' as const,
    accountMatchReason:
      'Multiple statement accounts could match this document; the user should choose or confirm the account.',
  };
}

export function classifyStatementDocument(params: {
  fileName: string;
  text: string;
  accounts?: StatementAccountCandidate[] | undefined;
  linkedAccountId?: string | null | undefined;
}): StatementClassification {
  const sample = `${params.fileName}\n${params.text}`.slice(0, 80_000);
  const normalizedDocumentText = normalizeText(sample);
  const credit = scoreClues(sample, CREDIT_CARD_CLUES);
  const bank = scoreClues(sample, BANK_CLUES);
  const detectedStatementType: KevinStatementType =
    credit.score > bank.score ? 'credit_card_statement' : 'bank_statement';
  const winningScore = Math.max(credit.score, bank.score);
  const margin = Math.abs(credit.score - bank.score);
  const confidence = confidenceFor(winningScore, margin);
  const evidence =
    detectedStatementType === 'credit_card_statement' ? credit.evidence : bank.evidence;

  const accountMatch = resolveSuggestedAccount({
    statementType: detectedStatementType,
    confidence,
    accounts: params.accounts ?? [],
    normalizedDocumentText,
    linkedAccountId: params.linkedAccountId,
  });

  const evidenceWithFallback =
    evidence.length > 0 ? evidence : ['No decisive bank or credit card language was found.'];

  return {
    detectedStatementType,
    confidence,
    evidence: evidenceWithFallback.slice(0, 6),
    ...accountMatch,
    requiresConfirmation:
      confidence === 'low' ||
      accountMatch.accountMatchStatus === 'ambiguous' ||
      accountMatch.accountMatchStatus === 'conflict',
  };
}
