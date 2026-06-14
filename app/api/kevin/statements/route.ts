// Kevin-only statement upload flow. Unlike the main Bank Import endpoint, this
// classifies uploaded files before choosing a statement methodology.
import { z } from 'zod';

import { askKevin } from '@/lib/kevin/service';
import { apiError, withApiTeamRole } from '@/lib/auth/api';
import { getAccountsForTeam, requireActiveCoa } from '@/lib/db/queries';
import {
  extractStatement,
  processSpreadsheetStatementImport,
  uploadStatement,
} from '@/lib/imports/statement-import/statement-import-service';
import type { StatementClassification } from '@/lib/imports/statement-import/statement-classifier';

export const runtime = 'nodejs';
export const maxDuration = 240;

type KevinUploadIntent = 'none' | 'question' | 'extract' | 'categorize' | 'journal' | 'post';

const KevinStatementUploadFieldsSchema = z.object({
  importBatchId: z.string().uuid(),
  instructions: z.string().max(8_000).default(''),
  threadId: z.string().uuid().optional(),
  modelTier: z.enum(['small', 'medium', 'large']).optional(),
});

function optionalFormString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function inferUploadIntent(instructions: string): KevinUploadIntent {
  const normalized = instructions.toLowerCase();
  if (!normalized.trim()) return 'none';

  if (/\b(post|book|record)\b/.test(normalized)) {
    return 'post';
  }

  if (/\b(journal|journals|je|entry|entries|debit|credit)\b/.test(normalized)) {
    return 'journal';
  }

  if (/\b(categorize|categorise|classify|code|map|assign\s+accounts?)\b/.test(normalized)) {
    return 'categorize';
  }

  if (/\b(extract|parse|import|process|load|transactions?)\b/.test(normalized)) {
    return 'extract';
  }

  return 'question';
}

function statementTypeLabel(classification: StatementClassification) {
  return classification.detectedStatementType === 'credit_card_statement'
    ? 'credit card statement'
    : 'bank statement';
}

function classificationSummary(classification: StatementClassification) {
  return `${statementTypeLabel(classification)} (${classification.confidence} confidence: ${classification.evidence.join('; ')})`;
}

function accountSummary(classification: StatementClassification) {
  if (classification.suggestedLinkedAccountName) {
    const code = classification.suggestedLinkedAccountCode
      ? `${classification.suggestedLinkedAccountCode} - `
      : '';
    return ` I linked it to ${code}${classification.suggestedLinkedAccountName}.`;
  }

  if (classification.accountMatchStatus === 'ambiguous') {
    return ' I need you to choose or confirm the statement account before posting.';
  }

  if (classification.accountMatchStatus === 'conflict') {
    return ` ${classification.accountMatchReason}`;
  }

  return '';
}

function needsConfirmationMessage(fileName: string, classification: StatementClassification) {
  return [
    `I uploaded ${fileName} and classified it as a ${classificationSummary(classification)}.`,
    accountSummary(classification).trim(),
    'I have not extracted, categorized, or posted it yet. Please confirm the statement type and linked account before I apply a methodology.',
  ]
    .filter(Boolean)
    .join(' ');
}

export const POST = withApiTeamRole(
  ['owner', 'member', 'advisor', 'bookkeeper'],
  async ({ user, team }, request) => {
    const formData = await request.formData();
    const file = formData.get('file');
    const importBatchId = formData.get('importBatchId');
    const rawInstructions = formData.get('instructions');
    const rawThreadId = formData.get('threadId');
    const rawModelTier = formData.get('modelTier');

    if (!file || !(file instanceof File)) {
      return apiError('PDF or CSV file is required (field name "file")', 400);
    }

    const fieldParse = KevinStatementUploadFieldsSchema.safeParse({
      importBatchId,
      instructions: typeof rawInstructions === 'string' ? rawInstructions.trim() : '',
      threadId: optionalFormString(rawThreadId),
      modelTier: optionalFormString(rawModelTier),
    });

    if (!fieldParse.success) {
      return apiError(fieldParse.error.issues[0]?.message ?? 'Invalid Kevin statement upload', 400);
    }

    const {
      importBatchId: parsedImportBatchId,
      instructions,
      threadId,
      modelTier,
    } = fieldParse.data;
    const intent = inferUploadIntent(instructions);

    try {
      await requireActiveCoa(team.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'CoA is not active. Seed or import a Chart of Accounts before continuing.';
      return apiError(message, 400);
    }

    try {
      const accounts = await getAccountsForTeam(team.id);
      const uploadResult = await uploadStatement({
        orgId: team.id,
        userId: user.id,
        file,
        importBatchId: parsedImportBatchId,
        classificationMode: 'auto',
        accounts,
        processSpreadsheetOnUpload: false,
      });
      const classification = uploadResult.classification;

      if (!classification) {
        return apiError('Kevin statement classification failed', 400);
      }

      let statementImport = uploadResult.statementImport;
      let transactionCount: number | null = null;
      let extractionModel: string | null = null;
      let processingError: string | null = null;
      const shouldProcess = ['extract', 'categorize', 'journal', 'post'].includes(intent);

      if (shouldProcess && !classification.requiresConfirmation) {
        try {
          if (statementImport.mimeType === 'text/csv') {
            const processed = await processSpreadsheetStatementImport({
              orgId: team.id,
              statementImportId: statementImport.id,
            });
            statementImport = processed.statementImport;
            transactionCount = processed.transactionCount;
          } else {
            const extracted = await extractStatement({
              orgId: team.id,
              statementImportId: statementImport.id,
            });
            transactionCount = extracted.transactionCount;
            extractionModel = extracted.model;
          }
        } catch (error) {
          processingError = error instanceof Error ? error.message : 'Unable to process statement';
        }
      }

      if (intent === 'question') {
        const answer = await askKevin({
          orgId: team.id,
          userId: user.id,
          threadId,
          preferredModelTier: modelTier,
          message: [
            `The user uploaded ${file.name}, classified as ${statementTypeLabel(classification)}.`,
            'Answer using uploaded statement context when relevant.',
            instructions,
          ].join('\n'),
        });

        return Response.json(
          {
            success: true,
            importId: statementImport.id,
            importBatchId: statementImport.importBatchId,
            fileName: statementImport.fileName,
            status: statementImport.status,
            classification,
            message: answer.response.answer,
            askResult: answer,
          },
          { status: 201 },
        );
      }

      let message: string;
      if (intent === 'none') {
        message = [
          `I uploaded ${file.name} and classified it as a ${classificationSummary(classification)}.`,
          accountSummary(classification).trim(),
          'I have not extracted, categorized, or posted it yet. What would you like me to do with this file?',
        ]
          .filter(Boolean)
          .join(' ');
      } else if (classification.requiresConfirmation) {
        message = needsConfirmationMessage(file.name, classification);
      } else if (processingError) {
        message = [
          `I uploaded ${file.name} and classified it as a ${classificationSummary(classification)}.`,
          accountSummary(classification).trim(),
          `I could not complete the requested processing: ${processingError}`,
        ]
          .filter(Boolean)
          .join(' ');
      } else if (shouldProcess) {
        const next =
          intent === 'post'
            ? 'I did not post anything. Review the import and use the final confirmation before journals are created.'
            : intent === 'journal'
              ? 'I prepared the import data for journal review. Posting still requires an explicit confirmation.'
              : 'I did not post anything.';
        message = [
          `I uploaded ${file.name}, classified it as a ${classificationSummary(classification)}, and extracted ${transactionCount ?? 0} transactions.`,
          accountSummary(classification).trim(),
          extractionModel ? ` Extraction used ${extractionModel}.` : '',
          next,
        ]
          .filter(Boolean)
          .join(' ');
      } else {
        message = `I uploaded ${file.name} and classified it as a ${classificationSummary(classification)}.${accountSummary(classification)}`;
      }

      return Response.json(
        {
          success: true,
          importId: statementImport.id,
          importBatchId: statementImport.importBatchId,
          fileName: statementImport.fileName,
          status: statementImport.status,
          classification,
          transactionCount,
          extractionModel,
          processingError,
          message,
        },
        { status: 201 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload statement';
      return apiError(message, 400);
    }
  },
);
