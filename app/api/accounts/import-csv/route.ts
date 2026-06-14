import {
  applyChartOfAccountsRows,
  ChartOfAccountsImportError,
} from '@/lib/accounting/chart-of-accounts-service';
import { parseCoaCsv } from '@/lib/accounting/accounts-import';
import { apiError, withApiTeamRole } from '@/lib/auth/api';

export const maxDuration = 60;

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ team }, request) => {
    const teamId = team.id;
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

    let rows;
    try {
      rows = parseCoaCsv(csvText);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid CSV format';
      return apiError(message, 400);
    }

    let result;
    try {
      result = await applyChartOfAccountsRows(teamId, rows);
    } catch (error) {
      if (error instanceof ChartOfAccountsImportError) {
        return Response.json({ success: false, errors: error.errors }, { status: 400 });
      }
      const message = error instanceof Error ? error.message : 'Failed to import CoA CSV';
      return apiError(message, 400);
    }

    return Response.json(
      {
        success: true,
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
      },
      { status: 200 },
    );
  },
);
