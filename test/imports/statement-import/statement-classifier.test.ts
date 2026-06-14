import { describe, expect, it } from 'vitest';

import { classifyStatementDocument } from '@/lib/imports/statement-import/statement-classifier';

const bankAccount = {
  id: 'acct_bank',
  code: '11000',
  name: 'Operating Checking',
  type: 'asset',
  isActive: true,
  isStatementAccount: true,
};

const creditCardAccount = {
  id: 'acct_card',
  code: '21050',
  name: 'American Express Payable',
  type: 'liability',
  isActive: true,
  isStatementAccount: true,
};

describe('classifyStatementDocument', () => {
  it('detects a bank statement and auto-links the only matching asset statement account', () => {
    const result = classifyStatementDocument({
      fileName: 'operating-checking.pdf',
      text: [
        'Bank Statement',
        'Operating Checking Account',
        'Beginning balance 10,000.00',
        'Deposits and other credits 2,500.00',
        'Withdrawals and debits 1,100.00',
        'Ending balance 11,400.00',
      ].join('\n'),
      accounts: [bankAccount, creditCardAccount],
    });

    expect(result.detectedStatementType).toBe('bank_statement');
    expect(result.confidence).toBe('high');
    expect(result.suggestedLinkedAccountId).toBe(bankAccount.id);
    expect(result.accountMatchStatus).toBe('matched');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('detects a credit card statement and auto-links the only matching liability statement account', () => {
    const result = classifyStatementDocument({
      fileName: 'amex-card.pdf',
      text: [
        'American Express Credit Card Statement',
        'Cardmember account ending in 1234',
        'New balance 824.13',
        'Minimum payment due 35.00',
        'Payment due date 07/15/2026',
        'Purchases, fees charged, and interest charge',
      ].join('\n'),
      accounts: [bankAccount, creditCardAccount],
    });

    expect(result.detectedStatementType).toBe('credit_card_statement');
    expect(result.confidence).toBe('high');
    expect(result.suggestedLinkedAccountId).toBe(creditCardAccount.id);
    expect(result.accountMatchStatus).toBe('matched');
    expect(result.requiresConfirmation).toBe(false);
  });

  it('marks generic transaction exports as low confidence', () => {
    const result = classifyStatementDocument({
      fileName: 'transactions.csv',
      text: 'Date,Description,Amount\n2026-06-01,Coffee Shop,-10.00\n',
      accounts: [bankAccount, creditCardAccount],
    });

    expect(result.confidence).toBe('low');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.suggestedLinkedAccountId).toBeNull();
  });

  it('requires confirmation when the detected statement type conflicts with a linked account', () => {
    const result = classifyStatementDocument({
      fileName: 'card.pdf',
      text: 'Credit Card Statement\nMinimum payment due\nPayment due date\nCredit limit',
      linkedAccountId: bankAccount.id,
      accounts: [bankAccount, creditCardAccount],
    });

    expect(result.detectedStatementType).toBe('credit_card_statement');
    expect(result.accountMatchStatus).toBe('conflict');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.suggestedLinkedAccountId).toBeNull();
  });

  it('asks the user to choose when multiple statement accounts could match', () => {
    const result = classifyStatementDocument({
      fileName: 'bank.pdf',
      text: 'Bank Statement\nChecking Account\nDeposits\nWithdrawals\nBeginning balance\nEnding balance',
      accounts: [
        bankAccount,
        {
          id: 'acct_bank_2',
          code: '11010',
          name: 'Payroll Checking',
          type: 'asset',
          isActive: true,
          isStatementAccount: true,
        },
      ],
    });

    expect(result.detectedStatementType).toBe('bank_statement');
    expect(result.confidence).toBe('high');
    expect(result.accountMatchStatus).toBe('ambiguous');
    expect(result.requiresConfirmation).toBe(true);
  });
});
