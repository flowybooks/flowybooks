import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/middleware', () => ({
  requireTeamRole: vi.fn(),
  isAuthorizationError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AuthorizationError',
}));

vi.mock('@/lib/db/queries', () => ({
  getJournalBatchesForTeam: vi.fn(),
  getStatementImportById: vi.fn(),
  getParsedTransactionsForImport: vi.fn(),
  getAccountsForTeam: vi.fn(),
}));

import { requireTeamRole } from '@/lib/auth/middleware';
import {
  getAccountsForTeam,
  getJournalBatchesForTeam,
  getParsedTransactionsForImport,
  getStatementImportById,
} from '@/lib/db/queries';
import { GET as getJournals } from '@/app/api/journals/route';
import { GET as getStatementImport } from '@/app/api/statement-imports/[id]/route';
import { GET as exportStatementImport } from '@/app/api/statement-imports/[id]/export-csv/route';

const auth = vi.mocked(requireTeamRole);
const journalBatches = vi.mocked(getJournalBatchesForTeam);
const statementImportById = vi.mocked(getStatementImportById);
const parsedTransactions = vi.mocked(getParsedTransactionsForImport);
const accountsForTeam = vi.mocked(getAccountsForTeam);

function authError(status: 401 | 403) {
  return Object.assign(new Error(status === 401 ? 'User is not authenticated' : 'Forbidden'), {
    name: 'AuthorizationError',
    status,
  });
}

function mockAuth() {
  auth.mockResolvedValue({
    user: {
      id: 7,
      email: 'user@example.com',
      name: 'Synthetic User',
      role: 'owner',
      currentOrgId: 42,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    team: {
      id: 42,
      publicId: 'abcde',
      name: 'Synthetic Org',
      taxId: null,
      domicileCountry: null,
      fiscalYearEndMonth: 12,
      slug: null,
      logo: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      metadata: null,
      members: [],
    },
    role: 'owner',
  });
}

describe('protected API route authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when a protected route has no authenticated user', async () => {
    auth.mockRejectedValue(authError(401));

    const response = await getJournals(new Request('http://localhost/api/journals'), {});
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(journalBatches).not.toHaveBeenCalled();
  });

  it('scopes statement import detail reads to the authenticated organization', async () => {
    mockAuth();
    statementImportById.mockResolvedValue({
      id: 'import-1',
      orgId: 42,
      importBatchId: 'batch-1',
      linkedAccountId: null,
      fileName: 'synthetic.csv',
      fileSize: 123,
      mimeType: 'text/csv',
      fileChecksum: null,
      sourceText: 'raw source should not be returned',
      sourcePageCount: null,
      sourceInfo: { institution: 'Synthetic Bank' },
      statementType: 'bank_statement',
      institutionName: null,
      accountNumber: null,
      statementStartDate: null,
      statementEndDate: null,
      beginningBalanceCents: null,
      endingBalanceCents: null,
      status: 'uploaded',
      extractionModel: null,
      errorMessage: null,
      uploadedBy: 7,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    parsedTransactions.mockResolvedValue([]);

    const response = await getStatementImport(
      new Request('http://localhost/api/imports/import-1'),
      {
        params: Promise.resolve({ id: 'import-1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(statementImportById).toHaveBeenCalledWith('import-1', 42);
    expect(parsedTransactions).toHaveBeenCalledWith('import-1', 42);
    expect(body.import.sourceText).toBeUndefined();
    expect(body.import.sourceInfo).toBeUndefined();
  });

  it('exports statement import rows through the authenticated organization scope', async () => {
    mockAuth();
    statementImportById.mockResolvedValue({
      id: 'import-1',
      orgId: 42,
      importBatchId: 'batch-1',
      linkedAccountId: 'acct-bank',
      fileName: 'synthetic.csv',
      fileSize: 123,
      mimeType: 'text/csv',
      fileChecksum: null,
      sourceText: '',
      sourcePageCount: null,
      sourceInfo: null,
      statementType: 'bank_statement',
      institutionName: null,
      accountNumber: null,
      statementStartDate: null,
      statementEndDate: null,
      beginningBalanceCents: null,
      endingBalanceCents: null,
      status: 'uploaded',
      extractionModel: null,
      errorMessage: null,
      uploadedBy: 7,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    parsedTransactions.mockResolvedValue([
      {
        id: 'tx-1',
        lineNumber: 1,
        transactionDate: new Date('2026-01-15T00:00:00Z'),
        description: 'Coffee beans',
        rawDescription: 'Coffee beans',
        normalizedDescription: 'coffee beans',
        amountCents: -10000,
        checkNumber: null,
        suggestedAccountId: null,
        categoryConfidence: 'manual',
        confirmedAccountId: 'acct-expense',
        allocations: null,
        isExcluded: false,
        journalBatchId: null,
      },
    ]);
    accountsForTeam.mockResolvedValue([
      {
        id: 'acct-bank',
        orgId: 42,
        code: '10000',
        name: 'Bank Account',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        isStatementAccount: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'acct-expense',
        orgId: 42,
        code: '60000',
        name: 'Operating Expense',
        type: 'expense',
        classification: 'operating_expense',
        isActive: true,
        isStatementAccount: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const response = await exportStatementImport(
      new Request('http://localhost/api/imports/import-1/export-csv'),
      {
        params: Promise.resolve({ id: 'import-1' }),
      },
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(statementImportById).toHaveBeenCalledWith('import-1', 42);
    expect(parsedTransactions).toHaveBeenCalledWith('import-1', 42);
    expect(accountsForTeam).toHaveBeenCalledWith(42);
    expect(csv).toContain('Coffee beans');
    expect(csv).toContain('10000');
    expect(csv).toContain('60000');
  });
});
