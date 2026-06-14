import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { purgeStatementImportSourceTextOlderThan } from '@/lib/db/queries';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { purgedCount, cutoff } = await purgeStatementImportSourceTextOlderThan({
    days: 7,
  });

  return NextResponse.json({
    success: true,
    purgedCount,
    cutoff: cutoff.toISOString(),
  });
}
