import { describe, expect, it } from 'vitest';
import {
  enforceLast4AccountNumber,
  redactHighRiskPII,
  sanitizeForAICategorization,
} from '../../lib/redaction';

describe('redaction', () => {
  it('enforces last-4 account number output', () => {
    expect(enforceLast4AccountNumber('Account 123456789')).toBe('6789');
    expect(enforceLast4AccountNumber('**** 9876')).toBe('9876');
    expect(enforceLast4AccountNumber(null)).toBeNull();
  });

  it('redacts labeled account numbers while keeping last 4', () => {
    const input = 'Account Number: 1234 5678 9012 3456';
    expect(redactHighRiskPII(input)).toBe('Account Number: ****3456');
  });

  it('redacts routing numbers, SSNs, emails, and phone numbers', () => {
    const input = `Routing: 123456789 SSN 123-45-6789 email ${['test', 'example.com'].join('@')} phone (555) 123-4567`;
    const output = redactHighRiskPII(input);
    expect(output).toContain('Routing: [REDACTED_ROUTING]');
    expect(output).toContain('[REDACTED_SSN]');
    expect(output).toContain('[REDACTED_EMAIL]');
    expect(output).toContain('[REDACTED_PHONE]');
  });

  it('does not redact dates or dollar amounts', () => {
    const input = 'Purchase on 2026-01-06 for $123.45 at SUPPLY VENDOR';
    expect(redactHighRiskPII(input)).toBe(input);
  });

  it('sanitizes long digit runs for categorization prompts', () => {
    const input = 'VENDOR INVOICE 1234567890 REF 9876543';
    const output = sanitizeForAICategorization(input);
    expect(output).not.toContain('1234567890');
    expect(output).not.toContain('9876543');
    expect(output).toContain('[REDACTED_NUMBER]');
  });
});
