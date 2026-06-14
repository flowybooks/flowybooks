import { requireActiveCoa } from '@/lib/db/queries';
import { importCsvJournals, type CsvJournalLine } from '@/lib/accounting/journal-import';
import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { inferCsvDelimiter, parseCsvRows } from '@/lib/utils/csv';

export const maxDuration = 60;

function normalizeHeader(name: string) {
  return name.toLowerCase().replace(/\s+/g, '');
}

function getIndex(headers: string[], expected: string) {
  const normalized = headers.map(normalizeHeader);
  const target = normalizeHeader(expected);
  const idx = normalized.indexOf(target);
  if (idx === -1) {
    throw new Error(`Missing required column: ${expected}`);
  }
  return idx;
}

function parseNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  const n = Number(trimmed);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number: "${value}"`);
  }
  return n;
}

function parseDate(value: string): Date {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('GLDate is required');
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid GLDate: "${value}"`);
  }
  return d;
}

function parseCsv(text: string): CsvJournalLine[] {
  const sanitizedText = text.replace(/^\uFEFF/, '');
  const delimiter = inferCsvDelimiter(sanitizedText.split(/\r?\n/, 1)[0] ?? '');
  const csvRows = parseCsvRows(sanitizedText, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (csvRows.length < 2) {
    throw new Error('CSV must include a header row and at least one data row');
  }

  const [headers, ...rows] = csvRows;
  if (!headers) {
    throw new Error('CSV must include a header row');
  }

  const idxGLDate = getIndex(headers, 'GLDate');
  const idxNarration = getIndex(headers, 'Narration');
  const idxDescription = getIndex(headers, 'Description');
  const idxGLAccount = getIndex(headers, 'GLAccount');
  const idxDebit = getIndex(headers, 'Debit');
  const idxCredit = getIndex(headers, 'Credit');

  const idxTag1 = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader('Tag1'));
  const idxTag2 = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader('Tag2'));
  const idxTag3 = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader('Tag3'));
  const idxTag4 = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader('Tag4'));
  const idxTag5 = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader('Tag5'));

  const result: CsvJournalLine[] = [];

  for (const cols of rows) {
    if (cols.length === 1 && (cols[0] ?? '').trim() === '') {
      continue;
    }

    const glDate = parseDate(cols[idxGLDate] ?? '');
    const narration = (cols[idxNarration] ?? '').trim();
    const description = (cols[idxDescription] ?? '').trim();
    const glAccount = (cols[idxGLAccount] ?? '').trim();
    const debit = parseNumber(cols[idxDebit] ?? '');
    const credit = parseNumber(cols[idxCredit] ?? '');

    const tag1 = idxTag1 >= 0 ? (cols[idxTag1] ?? '').trim() || undefined : undefined;
    const tag2 = idxTag2 >= 0 ? (cols[idxTag2] ?? '').trim() || undefined : undefined;
    const tag3 = idxTag3 >= 0 ? (cols[idxTag3] ?? '').trim() || undefined : undefined;
    const tag4 = idxTag4 >= 0 ? (cols[idxTag4] ?? '').trim() || undefined : undefined;
    const tag5 = idxTag5 >= 0 ? (cols[idxTag5] ?? '').trim() || undefined : undefined;

    result.push({
      glDate,
      narration,
      description,
      glAccount,
      debit,
      credit,
      tag1,
      tag2,
      tag3,
      tag4,
      tag5,
    });
  }

  return result;
}

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, request) => {
    const userId = user.id;
    const teamId = team.id;
    try {
      await requireActiveCoa(teamId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'CoA is not active. Seed or import a Chart of Accounts before continuing.';
      return apiError(message, 400);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return apiError('CSV file is required (field name "file")', 400);
    }

    if (file.type !== 'text/csv') {
      return apiError('Unsupported file type. Only text/csv is allowed.', 415);
    }

    if (file instanceof File && !file.name.toLowerCase().endsWith('.csv')) {
      return apiError('Invalid file extension. CSV files must end with .csv', 400);
    }

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      return apiError('CSV file size exceeds 5MB limit', 413);
    }

    let csvText: string;
    try {
      csvText = await (file as Blob).text();
    } catch {
      return apiError('Unable to read uploaded file', 400);
    }

    const nonEmptyLines = csvText.split(/\r?\n/).filter((line) => line.trim());
    const dataRowCount = Math.max(0, nonEmptyLines.length - 1);
    const maxRows = 200_000;
    if (dataRowCount > maxRows) {
      return apiError(`CSV exceeds maximum row limit (${maxRows})`, 413);
    }

    let lines: CsvJournalLine[];
    try {
      lines = parseCsv(csvText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid CSV format';
      return apiError(message, 400);
    }

    try {
      const result = await importCsvJournals({
        orgId: teamId,
        createdByUserId: userId,
        status: 'draft',
        lines,
      });

      return Response.json(
        {
          success: true,
          batches: result.batches,
          totals: result.totals,
        },
        { status: 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import CSV journals';
      return apiError(message, 400);
    }
  },
);
