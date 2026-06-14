import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  parseCoaCsv,
  planCoaImport,
  type ExistingAccount,
} from '../../lib/accounting/accounts-import';

describe('parseCoaCsv', () => {
  it('parses a basic valid CSV row', () => {
    const csv = [
      'Code,Name,Type,Classification,IsActive',
      '10000,Cash,asset,current_asset,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      mode: null,
      code: '10000',
      name: 'Cash',
      type: 'asset',
      classification: 'current_asset',
      isActive: true,
    });
  });

  it('parses quoted names that contain commas', () => {
    const csv = [
      'Code,Name,Type,Classification,IsActive',
      '10000,"Cash, Operating",asset,current_asset,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: '10000',
      name: 'Cash, Operating',
      type: 'asset',
      classification: 'current_asset',
      isActive: true,
    });
  });

  it('throws when Name is missing', () => {
    const csv = ['Code,Name,Type,Classification', '10000, ,asset,current_asset'].join('\n');

    expect(() => parseCoaCsv(csv)).toThrow(/Missing Name/);
  });

  it('throws when Type is missing', () => {
    const csv = ['Code,Name,Type,Classification', '10000,Cash, ,current_asset'].join('\n');

    expect(() => parseCoaCsv(csv)).toThrow(/Missing Type/);
  });

  it('throws when Classification is missing', () => {
    const csv = ['Code,Name,Type,Classification', '10000,Cash,asset, '].join('\n');

    expect(() => parseCoaCsv(csv)).toThrow(/Missing Classification/);
  });

  it('throws on invalid Mode', () => {
    const csv = ['Mode,Code,Name,Type,Classification', 'creat,10000,Cash,asset,current_asset'].join(
      '\n',
    );

    expect(() => parseCoaCsv(csv)).toThrow(/Invalid Mode/);
  });

  it('throws on invalid Type', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification',
      'create,10000,Cash,assett,current_asset',
    ].join('\n');

    expect(() => parseCoaCsv(csv)).toThrow(/Invalid Type/);
  });

  it('throws on invalid Classification', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification',
      'create,10000,Cash,asset,not_a_real_classification',
    ].join('\n');

    expect(() => parseCoaCsv(csv)).toThrow(/Invalid Classification/);
  });

  it('enforces classification → type mapping', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification',
      'create,10000,Cash,income,current_asset',
    ].join('\n');

    expect(() => parseCoaCsv(csv)).toThrow(
      /Classification "current_asset" is not valid for Type "income"/,
    );
  });

  it('allows new equity and expense classifications', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'create,30010,Preferred Stock,equity,preferred_stock,true',
      'create,70010,Depreciation Expense,expense,depreciation,false',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      code: '30010',
      classification: 'preferred_stock',
      type: 'equity',
    });
    expect(rows[1]).toMatchObject({
      code: '70010',
      classification: 'depreciation',
      type: 'expense',
      isActive: false,
    });
  });

  it('keeps the bundled standard CoA compatible with protected system accounts', () => {
    const csv = readFileSync(path.join(process.cwd(), 'Standard-COA-v2.csv'), 'utf8');
    const rows = parseCoaCsv(csv);

    expect(rows.find((row) => row.name === 'Opening Balance Equity')).toMatchObject({
      type: 'equity',
      classification: 'other_equity',
    });

    const result = planCoaImport(rows, []);

    expect(result.errors).toHaveLength(0);
  });
});

describe('planCoaImport', () => {
  it('plans initial import creates and enforces Retained Earnings presence', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'create,10000,Cash,asset,current_asset,true',
      'create,31000,Retained Earnings,equity,retained_earnings,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);
    const existing: ExistingAccount[] = [];

    const result = planCoaImport(rows, existing);

    expect(result.errors).toHaveLength(0);
    expect(result.toCreate).toHaveLength(2);
    expect(result.toUpdate).toHaveLength(0);
    expect(result.toDelete).toHaveLength(0);
  });

  it('rejects initial import without Retained Earnings', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'create,10000,Cash,asset,current_asset,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);
    const existing: ExistingAccount[] = [];

    const result = planCoaImport(rows, existing);

    expect(result.toCreate).toHaveLength(0);
    expect(result.errors.some((e) => e.includes('Retained Earnings'))).toBe(true);
  });

  it('rejects initial import with malformed protected system account classifications', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'create,10000,Cash,asset,current_asset,true',
      'create,31000,Retained Earnings,equity,retained_earnings,true',
      'create,32000,Opening Balance Equity,equity,equity,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);
    const result = planCoaImport(rows, []);

    expect(result.toCreate).toHaveLength(0);
    expect(
      result.errors.some((error) =>
        error.includes('Account "Opening Balance Equity" must use classification "other_equity".'),
      ),
    ).toBe(true);
  });

  it('plans a create when code does not exist in bulk mode', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'create,40000,Sales,income,sales,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: false,
      },
      {
        id: '2',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: true,
      },
    ];

    const result = planCoaImport(rows, existing);

    expect(result.errors).toHaveLength(0);
    expect(result.toCreate).toHaveLength(1);
    expect(result.toCreate[0]).toMatchObject({
      code: '40000',
      name: 'Sales',
      type: 'income',
      classification: 'sales',
    });
  });

  it('rejects create for an existing code in bulk mode', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'create,10000,Cash Duplicate,asset,current_asset,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: false,
      },
      {
        id: '2',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: true,
      },
    ];

    const result = planCoaImport(rows, existing);

    expect(result.toCreate).toHaveLength(0);
    expect(
      result.errors.some((e) =>
        e.includes(
          'Mode=create row for Code "10000" but an account with this code already exists.',
        ),
      ),
    ).toBe(true);
  });

  it('allows updating type when account has no activity', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'update,10000,Office Rent,expense,depreciation,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: false,
      },
      {
        id: '2',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: true,
      },
    ];

    const result = planCoaImport(rows, existing);

    expect(result.errors).toHaveLength(0);
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({
      id: '1',
      code: '10000',
      name: 'Office Rent',
      type: 'expense',
      classification: 'depreciation',
      isActive: true,
    });
  });

  it('rejects forbidden changes for active non-RE accounts', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'update,10000,Updated Cash,expense,depreciation,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: true,
      },
      {
        id: '2',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: true,
      },
    ];

    const result = planCoaImport(rows, existing);

    expect(result.toUpdate).toHaveLength(0);
    expect(
      result.errors.some((e) => e.includes('Cannot change Type for active account "10000"')),
    ).toBe(true);
    expect(
      result.errors.some((e) =>
        e.includes('Cannot change Classification for active account "10000"'),
      ),
    ).toBe(true);
  });

  it('repairs malformed protected system account classifications on retry', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'update,32000,Opening Balance Equity,equity,other_equity,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: true,
      },
      {
        id: '2',
        code: '32000',
        name: 'Opening Balance Equity',
        type: 'equity',
        classification: 'equity',
        isActive: true,
        hasActivity: false,
      },
    ];

    const result = planCoaImport(rows, existing);

    expect(result.errors).toHaveLength(0);
    expect(result.toUpdate).toContainEqual({
      id: '2',
      code: '32000',
      name: 'Opening Balance Equity',
      type: 'equity',
      classification: 'other_equity',
      isActive: true,
    });
  });

  it('rejects delete when account has activity or is Retained Earnings', () => {
    const csv = [
      'Mode,Code,Name,Type,Classification,IsActive',
      'delete,10000,Cash,asset,current_asset,true',
      'delete,31000,Retained Earnings,equity,retained_earnings,true',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: true,
      },
      {
        id: '2',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: false,
      },
    ];

    const result = planCoaImport(rows, existing);

    expect(result.toDelete).toHaveLength(0);
    expect(
      result.errors.some((e) =>
        e.includes(
          'Cannot delete account "10000" because it has journal activity; deactivate it instead.',
        ),
      ),
    ).toBe(true);
    expect(
      result.errors.some((e) =>
        e.includes(
          'Cannot delete the protected account "Retained Earnings"; it is required for reporting.',
        ),
      ),
    ).toBe(true);
  });

  it('supersedes missing inactive accounts when allowed', () => {
    const csv = [
      'Code,Name,Type,Classification',
      '10000,Cash,asset,current_asset',
      '31000,Retained Earnings,equity,retained_earnings',
    ].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash Old',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: false,
      },
      {
        id: '2',
        code: '20000',
        name: 'Payables',
        type: 'liability',
        classification: 'current_liability',
        isActive: true,
        hasActivity: false,
      },
      {
        id: '3',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: false,
      },
    ];

    const result = planCoaImport(rows, existing, { supersedeMissing: true });

    expect(result.toUpdate.some((update) => update.id === '2' && update.isActive === false)).toBe(
      true,
    );
    expect(result.toDelete).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('keeps protected accounts active when superseding', () => {
    const csv = ['Code,Name,Type,Classification', '12000,Prepaid,asset,current_asset'].join('\n');

    const rows = parseCoaCsv(csv);

    const existing: ExistingAccount[] = [
      {
        id: '1',
        code: '10000',
        name: 'Cash',
        type: 'asset',
        classification: 'current_asset',
        isActive: true,
        hasActivity: true,
      },
      {
        id: '2',
        code: '31000',
        name: 'Retained Earnings',
        type: 'equity',
        classification: 'retained_earnings',
        isActive: true,
        hasActivity: false,
      },
    ];

    const result = planCoaImport(rows, existing, { supersedeMissing: true });

    expect(result.toDelete).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.toUpdate.some((update) => update.id === '2')).toBe(false);
    expect(result.toUpdate.some((update) => update.id === '1' && update.isActive === false)).toBe(
      true,
    );
  });
});
