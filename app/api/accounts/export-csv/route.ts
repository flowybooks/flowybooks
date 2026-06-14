import { eq } from 'drizzle-orm';
import { READ_TEAM_ROLES, withApiTeamRole } from '@/lib/auth/api';
import { db } from '@/lib/db/drizzle';
import { accounts } from '@/lib/db/schema';

function neutralizeCsvFormula(value: string): string {
  if (/^\s*[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function csvEscape(value: string): string {
  const safeValue = neutralizeCsvFormula(value);
  if (/[",\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

export const GET = withApiTeamRole(READ_TEAM_ROLES, async ({ team }) => {
  const rows = await db
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      classification: accounts.classification,
    })
    .from(accounts)
    .where(eq(accounts.orgId, team.id))
    .orderBy(accounts.code);

  const header = 'Code,Name,Type,Classification';

  const lines = rows.map((row) => {
    const code = row.code;
    const name = row.name ?? '';
    const type = row.type;
    const classification = row.classification ?? '';

    return [csvEscape(code), csvEscape(name), csvEscape(type), csvEscape(classification)].join(',');
  });

  const csv = [header, ...lines].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `coa-${date}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
