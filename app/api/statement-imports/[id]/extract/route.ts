import { NextResponse } from 'next/server';
import { extractStatement } from '@/lib/imports/statement-import/statement-import-service';
import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { createSlidingWindowRateLimiter } from '@/lib/rate-limit';
import { updateStatementImport } from '@/lib/db/queries';
import { AiNotConfiguredError, getAiSetupMessage, isAiConfigured } from '@/lib/kevin/model-client';

// Required: pdf-parse and AI SDK need Node.js runtime
export const runtime = 'nodejs';
export const maxDuration = 300;

const extractionRateLimiter = createSlidingWindowRateLimiter({
  windowMs: 60 * 60_000,
  max: 50,
});

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ team }, _request, { params }: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await params;

      if (!isAiConfigured()) {
        return apiError(getAiSetupMessage(), 503);
      }

      const nowMs = Date.now();
      const rateLimit = extractionRateLimiter.consume(`ai.extract:${team.id}`, nowMs);
      if (!rateLimit.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil((rateLimit.resetAtMs - nowMs) / 1000));

        try {
          await updateStatementImport(id, team.id, {
            status: 'failed',
            errorMessage: `Rate limit exceeded. Try again in ${retryAfterSeconds}s.`,
          });
        } catch {
          // Best-effort only; never block the response on logging.
        }

        return NextResponse.json(
          { error: `Rate limit exceeded. Try again in ${retryAfterSeconds}s.` },
          {
            status: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) },
          },
        );
      }

      // Extract statement
      const result = await extractStatement({
        statementImportId: id,
        orgId: team.id,
      });

      return NextResponse.json({
        success: true,
        transactionCount: result.transactionCount,
        model: result.model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Extraction failed';
      const status = error instanceof AiNotConfiguredError ? error.status : 500;

      if (status >= 500) {
        console.error(`[statement-import] extraction failed: ${message}`);
      }

      return NextResponse.json({ error: message }, { status });
    }
  },
);
