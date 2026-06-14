import { NextResponse } from 'next/server';
import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { purgeStatementImportSourceText } from '@/lib/db/queries';

export const runtime = 'nodejs';

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ team }, _request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      const ok = await purgeStatementImportSourceText(id, team.id);
      if (!ok) {
        return apiError('Statement import not found', 404);
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Purge failed';
      console.error(`[statement-import] purge source failed: ${message}`);
      return apiError(message, 500);
    }
  },
);
