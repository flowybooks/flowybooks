import { inferCsvDelimiter, parseCsvRows } from '@/lib/utils/csv';

export type CoaMode = 'create' | 'update' | 'delete';

export type CoaType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type CoaClassification =
  // Assets
  | 'current_asset'
  | 'noncurrent_asset'
  | 'fixed_asset'
  | 'other_asset'
  // Liabilities
  | 'current_liability'
  | 'noncurrent_liability'
  | 'other_liability'
  // Equity
  | 'equity'
  | 'common_stock'
  | 'additional_paid_in_capital'
  | 'treasury_stock'
  | 'retained_earnings'
  | 'dividends_equity'
  | 'foreign_currency_translation'
  | 'preferred_stock'
  | 'other_equity'
  // Income
  | 'income'
  | 'interest_income'
  | 'dividend_income'
  | 'other_income'
  | 'sales'
  // Expense
  | 'expense'
  | 'operating_expense'
  | 'cogs'
  | 'other_expense'
  | 'depreciation'
  | 'fixed_costs'
  | 'variable_expenses';

export interface ParsedCoaRow {
  mode: CoaMode | null;
  code: string;
  name: string;
  type: CoaType;
  classification: CoaClassification;
  isActive: boolean | null;
  rawLineNumber: number;
}

const REQUIRED_HEADERS = ['Code', 'Name', 'Type', 'Classification'] as const;
const OPTIONAL_HEADERS = ['IsActive', 'Mode'] as const;
type HeaderName = (typeof REQUIRED_HEADERS)[number] | (typeof OPTIONAL_HEADERS)[number];

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim();
}

function parseBoolean(value: string, lineNumber: number): boolean | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  throw new Error(
    `Invalid IsActive value "${value}" on line ${lineNumber}. Expected true or false (case-insensitive).`,
  );
}

function parseMode(raw: string, lineNumber: number): CoaMode {
  const value = raw.trim().toLowerCase();
  if (value === '') return 'create';
  if (value === 'create' || value === 'update' || value === 'delete') {
    return value;
  }
  throw new Error(
    `Invalid Mode "${raw}" on line ${lineNumber}. Expected one of: create, update, delete.`,
  );
}

function parseType(raw: string, lineNumber: number): CoaType {
  const value = raw.trim().toLowerCase();
  if (value === '') {
    throw new Error(`Missing Type on line ${lineNumber}`);
  }
  if (
    value === 'asset' ||
    value === 'liability' ||
    value === 'equity' ||
    value === 'income' ||
    value === 'expense'
  ) {
    return value;
  }
  throw new Error(
    `Invalid Type "${raw}" on line ${lineNumber}. Expected one of: asset, liability, equity, income, expense.`,
  );
}

const ALL_CLASSIFICATIONS: CoaClassification[] = [
  'current_asset',
  'noncurrent_asset',
  'fixed_asset',
  'other_asset',
  'current_liability',
  'noncurrent_liability',
  'other_liability',
  'equity',
  'common_stock',
  'additional_paid_in_capital',
  'treasury_stock',
  'retained_earnings',
  'dividends_equity',
  'foreign_currency_translation',
  'preferred_stock',
  'other_equity',
  'income',
  'interest_income',
  'dividend_income',
  'other_income',
  'sales',
  'expense',
  'operating_expense',
  'cogs',
  'other_expense',
  'depreciation',
  'fixed_costs',
  'variable_expenses',
];

function parseClassification(raw: string, lineNumber: number): CoaClassification {
  const value = raw.trim().toLowerCase();
  if (value === '') {
    throw new Error(`Missing Classification on line ${lineNumber}`);
  }
  if (isCoaClassification(value)) {
    return value as CoaClassification;
  }
  throw new Error(`Invalid Classification "${raw}" on line ${lineNumber}.`);
}

export function isCoaClassification(value: string | null | undefined): value is CoaClassification {
  return typeof value === 'string' && ALL_CLASSIFICATIONS.includes(value as CoaClassification);
}

export const CLASSIFICATION_TO_TYPE: Record<CoaClassification, CoaType> = {
  // Assets
  current_asset: 'asset',
  noncurrent_asset: 'asset',
  fixed_asset: 'asset',
  other_asset: 'asset',

  // Liabilities
  current_liability: 'liability',
  noncurrent_liability: 'liability',
  other_liability: 'liability',

  // Equity
  equity: 'equity',
  common_stock: 'equity',
  additional_paid_in_capital: 'equity',
  treasury_stock: 'equity',
  retained_earnings: 'equity',
  dividends_equity: 'equity',
  foreign_currency_translation: 'equity',
  preferred_stock: 'equity',
  other_equity: 'equity',

  // Income
  income: 'income',
  interest_income: 'income',
  dividend_income: 'income',
  other_income: 'income',
  sales: 'income',

  // Expense
  expense: 'expense',
  operating_expense: 'expense',
  cogs: 'expense',
  other_expense: 'expense',
  depreciation: 'expense',
  fixed_costs: 'expense',
  variable_expenses: 'expense',
};

function validateClassificationMatchesType(
  type: CoaType,
  classification: CoaClassification,
  lineNumber: number,
): void {
  const expectedType = CLASSIFICATION_TO_TYPE[classification];
  if (expectedType !== type) {
    throw new Error(
      `Classification "${classification}" is not valid for Type "${type}" on line ${lineNumber}. Expected Type "${expectedType}".`,
    );
  }
}

export function parseCoaCsv(text: string): ParsedCoaRow[] {
  const sanitizedText = text.replace(/^\uFEFF/, '');
  const delimiter = inferCsvDelimiter(sanitizedText.split(/\r?\n/, 1)[0] ?? '');
  const csvRows = parseCsvRows(sanitizedText, delimiter).filter((row) =>
    row.some((cell) => cell.trim() !== ''),
  );
  if (csvRows.length === 0) {
    throw new Error('CSV is empty');
  }

  const rawHeaders = csvRows[0]!;
  const headers = rawHeaders.map(normalizeHeader);

  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required column "${required}" in header row`);
    }
  }

  const headerIndex: Record<HeaderName, number | null> = {
    Code: null,
    Name: null,
    Type: null,
    Classification: null,
    IsActive: null,
    Mode: null,
  };

  headers.forEach((h, idx) => {
    if (
      (REQUIRED_HEADERS as readonly string[]).includes(h) ||
      (OPTIONAL_HEADERS as readonly string[]).includes(h)
    ) {
      headerIndex[h as HeaderName] = idx;
    }
  });

  const rows: ParsedCoaRow[] = [];
  const hasModeHeader = headerIndex.Mode != null;

  for (let i = 1; i < csvRows.length; i++) {
    const lineNumber = i + 1; // 1-based, including header row
    const cells = csvRows[i] ?? [];

    const getCell = (header: HeaderName): string => {
      const idx = headerIndex[header];
      if (idx == null) return '';
      return cells[idx] ?? '';
    };

    const rawMode = hasModeHeader ? getCell('Mode') : '';
    const rawCode = getCell('Code');
    const rawName = getCell('Name');
    const rawType = getCell('Type');
    const rawClassification = getCell('Classification');
    const rawIsActive = getCell('IsActive');

    if (!rawCode || rawCode.trim() === '') {
      throw new Error(`Missing Code on line ${lineNumber}`);
    }

    if (/\s/.test(rawCode)) {
      throw new Error(
        `Invalid Code "${rawCode}" on line ${lineNumber}. Codes must not contain spaces.`,
      );
    }

    const mode = hasModeHeader ? parseMode(rawMode, lineNumber) : null;
    const type = parseType(rawType, lineNumber);
    const classification = parseClassification(rawClassification, lineNumber);
    const isActive = rawIsActive ? parseBoolean(rawIsActive, lineNumber) : null;

    validateClassificationMatchesType(type, classification, lineNumber);

    const name = rawName.trim();
    if (name === '') {
      throw new Error(`Missing Name on line ${lineNumber}`);
    }

    rows.push({
      mode,
      code: rawCode.trim(),
      name,
      type,
      classification,
      isActive,
      rawLineNumber: lineNumber,
    });
  }

  return rows;
}

export type ExistingAccount = {
  id: string;
  code: string;
  name: string;
  type: CoaType;
  classification: CoaClassification;
  isActive: boolean;
  hasActivity: boolean;
};

export type PlannedAccountCreate = {
  code: string;
  name: string;
  type: CoaType;
  classification: CoaClassification;
  isActive: boolean;
};

export type PlannedAccountUpdate = {
  id: string;
  code: string;
  name: string;
  type: CoaType;
  classification: CoaClassification;
  isActive: boolean;
};

export type PlannedAccountDelete = {
  id: string;
};

export type CoaImportResult = {
  toCreate: PlannedAccountCreate[];
  toUpdate: PlannedAccountUpdate[];
  toDelete: PlannedAccountDelete[];
  errors: string[];
};

function isRetainedEarningsAccount(account: { type: CoaType; name: string }): boolean {
  return account.type === 'equity' && account.name === 'Retained Earnings';
}

function isOpeningBalanceEquityAccount(account: { type: CoaType; name: string }): boolean {
  return account.type === 'equity' && account.name === 'Opening Balance Equity';
}

function isPriorPeriodAdjustmentsAccount(account: { type: CoaType; name: string }): boolean {
  return account.type === 'equity' && account.name === 'Prior Period Adjustments';
}

const PROTECTED_SYSTEM_ACCOUNT_CLASSIFICATIONS: Record<string, CoaClassification> = {
  'Retained Earnings': 'retained_earnings',
  'Opening Balance Equity': 'other_equity',
  'Prior Period Adjustments': 'other_equity',
};

function getRequiredProtectedClassification(account: {
  type: CoaType;
  name: string;
}): CoaClassification | null {
  if (account.type !== 'equity') return null;
  return PROTECTED_SYSTEM_ACCOUNT_CLASSIFICATIONS[account.name] ?? null;
}

function isProtectedSystemAccount(account: { type: CoaType; name: string }): boolean {
  return (
    isRetainedEarningsAccount(account) ||
    isOpeningBalanceEquityAccount(account) ||
    isPriorPeriodAdjustmentsAccount(account)
  );
}

export function planCoaImport(
  rows: ParsedCoaRow[],
  existingAccounts: ExistingAccount[],
  options: { supersedeMissing?: boolean } = {},
): CoaImportResult {
  const errors: string[] = [];

  const isInitialImport = existingAccounts.length === 0;

  if (isInitialImport) {
    const seenCodes = new Set<string>();
    for (const row of rows) {
      if (seenCodes.has(row.code)) {
        errors.push(
          `Duplicate Code "${row.code}" in CSV (initial import requires unique codes per file).`,
        );
      } else {
        seenCodes.add(row.code);
      }
    }

    const toCreate: PlannedAccountCreate[] = rows.map((row) => ({
      code: row.code,
      name: row.name,
      type: row.type,
      classification: row.classification,
      isActive: row.isActive ?? true,
    }));

    const hasRetainedEarnings = toCreate.some((acc) =>
      isRetainedEarningsAccount({ type: acc.type, name: acc.name }),
    );

    if (!hasRetainedEarnings) {
      errors.push(
        'Initial CoA import must include at least one equity account named "Retained Earnings".',
      );
    }

    for (const acc of toCreate) {
      const requiredClassification = getRequiredProtectedClassification(acc);
      if (requiredClassification && acc.classification !== requiredClassification) {
        errors.push(`Account "${acc.name}" must use classification "${requiredClassification}".`);
      }
    }

    if (errors.length > 0) {
      return {
        toCreate: [],
        toUpdate: [],
        toDelete: [],
        errors,
      };
    }

    return {
      toCreate,
      toUpdate: [],
      toDelete: [],
      errors: [],
    };
  }

  const codeToExisting = new Map<string, ExistingAccount>();
  for (const acc of existingAccounts) {
    codeToExisting.set(acc.code, acc);
  }

  const toCreate: PlannedAccountCreate[] = [];
  const toUpdate: PlannedAccountUpdate[] = [];
  const toDelete: PlannedAccountDelete[] = [];

  const seenCodes = new Set<string>();
  for (const row of rows) {
    if (seenCodes.has(row.code)) {
      errors.push(
        `Duplicate Code "${row.code}" appears multiple times in CSV; this is ambiguous in bulk mode.`,
      );
    } else {
      seenCodes.add(row.code);
    }

    const existing = codeToExisting.get(row.code) ?? null;
    const inferredMode: CoaMode = row.mode ?? (existing ? 'update' : 'create');
    const effectiveMode: CoaMode =
      row.mode === 'create' && existing && options.supersedeMissing ? 'update' : inferredMode;

    if (effectiveMode === 'create') {
      if (existing) {
        errors.push(
          `Mode=create row for Code "${row.code}" but an account with this code already exists.`,
        );
        continue;
      }

      if (isProtectedSystemAccount({ type: row.type, name: row.name })) {
        errors.push(`Account "${row.name}" is system-protected and cannot be created via import.`);
        continue;
      }

      toCreate.push({
        code: row.code,
        name: row.name,
        type: row.type,
        classification: row.classification,
        isActive: row.isActive ?? true,
      });
      continue;
    }

    if (effectiveMode === 'update') {
      if (!existing) {
        errors.push(
          `Mode=update row for Code "${row.code}" but no existing account was found with this code.`,
        );
        continue;
      }

      const isRE = isRetainedEarningsAccount(existing);
      const isOBE = isOpeningBalanceEquityAccount(existing);
      const isPpa = isPriorPeriodAdjustmentsAccount(existing);
      const isProtected = isRE || isOBE || isPpa;

      let finalCode = row.code;
      let finalType = row.type;
      let finalName = row.name;
      let finalClassification = row.classification;
      const finalIsActive = row.isActive ?? existing.isActive;

      if (existing.hasActivity && !isProtected) {
        if (row.type !== existing.type) {
          errors.push(
            `Cannot change Type for active account "${row.code}" (has journal activity).`,
          );
        }
        if (row.code !== existing.code) {
          errors.push(
            `Cannot change Code for active account "${row.code}" (has journal activity).`,
          );
        }
        if (row.classification !== existing.classification) {
          errors.push(
            `Cannot change Classification for active account "${row.code}" (has journal activity).`,
          );
        }
        finalCode = existing.code;
        finalType = existing.type;
        finalClassification = existing.classification;
      }

      if (isProtected) {
        const protectedName = existing.name;
        const requiredClassification = getRequiredProtectedClassification(existing);

        if (row.name !== existing.name) {
          errors.push(
            `Cannot change the Name of the protected account "${protectedName}"; it must remain "${protectedName}".`,
          );
          finalName = existing.name;
        }

        if (row.type !== existing.type || row.type !== 'equity') {
          errors.push(
            `Cannot change the Type of the protected account "${protectedName}"; it must remain "equity".`,
          );
          finalType = existing.type;
        }

        if (requiredClassification && row.classification !== requiredClassification) {
          errors.push(
            `Cannot change the Classification of the protected account "${protectedName}"; it must remain "${requiredClassification}".`,
          );
          finalClassification = requiredClassification;
        } else if (requiredClassification) {
          finalClassification = requiredClassification;
        }
      }

      const expectedTypeForFinalClassification = CLASSIFICATION_TO_TYPE[finalClassification];
      if (expectedTypeForFinalClassification !== finalType) {
        errors.push(
          `Classification "${finalClassification}" is not valid for Type "${finalType}" on account Code "${existing.code}".`,
        );
      }

      const changed =
        finalCode !== existing.code ||
        finalName !== existing.name ||
        finalType !== existing.type ||
        finalClassification !== existing.classification ||
        finalIsActive !== existing.isActive;

      if (changed) {
        toUpdate.push({
          id: existing.id,
          code: finalCode,
          name: finalName,
          type: finalType,
          classification: finalClassification,
          isActive: finalIsActive,
        });
      }
      continue;
    }

    if (effectiveMode === 'delete') {
      if (!existing) {
        errors.push(
          `Mode=delete row for Code "${row.code}" but no existing account was found with this code.`,
        );
        continue;
      }

      const isProtected = isProtectedSystemAccount({
        type: existing.type as CoaType,
        name: existing.name,
      });

      if (isProtected) {
        errors.push(
          `Cannot delete the protected account "${existing.name}"; it is required for reporting.`,
        );
        continue;
      }

      if (existing.hasActivity) {
        errors.push(
          `Cannot delete account "${row.code}" because it has journal activity; deactivate it instead.`,
        );
        continue;
      }

      toDelete.push({ id: existing.id });
      continue;
    }
  }

  if (options.supersedeMissing) {
    const toDeleteIds = new Set(toDelete.map((d) => d.id));
    for (const acc of existingAccounts) {
      if (seenCodes.has(acc.code)) continue;
      if (toDeleteIds.has(acc.id)) continue;

      const isProtected = isProtectedSystemAccount({
        type: acc.type as CoaType,
        name: acc.name,
      });
      if (isProtected) {
        continue;
      }

      if (!acc.isActive) {
        continue;
      }

      toUpdate.push({
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        classification: acc.classification,
        isActive: false,
      });
    }
  }

  const updateById = new Map<string, PlannedAccountUpdate>();
  for (const u of toUpdate) {
    updateById.set(u.id, u);
  }

  const deletedIds = new Set(toDelete.map((d) => d.id));

  let hasRetainedEarnings = false;

  for (const acc of existingAccounts) {
    if (deletedIds.has(acc.id)) continue;

    const updated = updateById.get(acc.id);
    const finalType = updated?.type ?? acc.type;
    const finalName = updated?.name ?? acc.name;

    if (isRetainedEarningsAccount({ type: finalType, name: finalName })) {
      hasRetainedEarnings = true;
      break;
    }
  }

  if (!hasRetainedEarnings) {
    for (const acc of toCreate) {
      if (isRetainedEarningsAccount({ type: acc.type, name: acc.name })) {
        hasRetainedEarnings = true;
        break;
      }
    }
  }

  if (!hasRetainedEarnings) {
    errors.push(
      'After applying this import, there would be no Retained Earnings account. At least one equity account named "Retained Earnings" is required.',
    );
  }

  if (errors.length > 0) {
    return {
      toCreate: [],
      toUpdate: [],
      toDelete: [],
      errors,
    };
  }

  return {
    toCreate,
    toUpdate,
    toDelete,
    errors: [],
  };
}
