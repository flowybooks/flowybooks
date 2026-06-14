import { describe, expect, it } from 'vitest';
import { normalizeStatementDescription } from '@/lib/imports/statement-import/normalize-description';

describe('normalizeStatementDescription', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeStatementDescription('  Hello   WORLD  ')).toBe('hello world');
  });

  it('removes trailing MM/DD style dates', () => {
    expect(normalizeStatementDescription('ONLINESTORE*ABC123XYZ ANYTOWN CA 12/05')).toBe(
      'onlinestore*abc123xyz anytown ca',
    );
  });

  it('keeps embedded numbers when there is no trailing date', () => {
    expect(normalizeStatementDescription('FUEL STATION 12345678 AUSTIN TX')).toBe(
      'fuel station 12345678 austin tx',
    );
  });
});
