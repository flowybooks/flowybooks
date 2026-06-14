// This file handles the first step of statement imports: saving uploaded files.
// It stores the import record, fingerprints files, and prepares the raw input
// that later extraction and categorization steps will build on.

import { createHash } from 'crypto';

import {
  createParsedTransactions,
  createStatementImport,
  getStatementImportById,
  updateStatementImport,
} from '@/lib/db/queries';
import type { NewParsedTransaction, NewStatementImport, StatementImport } from '@/lib/db/schema';
import { redactHighRiskPII } from '@/lib/redaction';

import { toUtcDateFromYmd } from '../date-utils';
import {
  classifyStatementDocument,
  type KevinStatementType,
  type StatementAccountCandidate,
  type StatementClassification,
} from '../statement-classifier';
import { normalizeStatementDescription } from '../normalize-description';
import { extractTextFromPdf } from '../pdf-extractor';
import { parseSpreadsheetStatement } from '../spreadsheet-parser';
import { autoCategorizeParsedTransactions } from './categorization';

interface UploadStatementParams {
  orgId: number;
  userId: number;
  file: File;
  statementType?: KevinStatementType | undefined;
  importBatchId: string;
  linkedAccountId?: string | undefined;
  classificationMode?: 'manual' | 'auto' | undefined;
  accounts?: StatementAccountCandidate[] | undefined;
  processSpreadsheetOnUpload?: boolean | undefined;
}

interface UploadStatementResult {
  statementImport: StatementImport;
  classification: StatementClassification | null;
}

function sourceInfoObject(sourceInfo: unknown): Record<string, unknown> {
  return typeof sourceInfo === 'object' && sourceInfo !== null && !Array.isArray(sourceInfo)
    ? (sourceInfo as Record<string, unknown>)
    : {};
}

function withClassification(sourceInfo: unknown, classification: StatementClassification | null) {
  const base = sourceInfoObject(sourceInfo);
  if (!classification) return base;
  return {
    ...base,
    classification,
  };
}

function resolveStatementType(params: {
  mode: 'manual' | 'auto';
  statementType?: KevinStatementType | undefined;
  fileName: string;
  text: string;
  accounts?: StatementAccountCandidate[] | undefined;
  linkedAccountId?: string | null | undefined;
}): {
  statementType: KevinStatementType;
  classification: StatementClassification | null;
  linkedAccountId?: string | undefined;
} {
  if (params.mode === 'manual') {
    if (!params.statementType) {
      throw new Error('Statement type is required');
    }
    return {
      statementType: params.statementType,
      classification: null,
      linkedAccountId: params.linkedAccountId ?? undefined,
    };
  }

  const classification = classifyStatementDocument({
    fileName: params.fileName,
    text: params.text,
    accounts: params.accounts,
    linkedAccountId: params.linkedAccountId,
  });

  return {
    statementType: classification.detectedStatementType,
    classification,
    linkedAccountId: params.linkedAccountId ?? classification.suggestedLinkedAccountId ?? undefined,
  };
}

export async function uploadStatement(
  params: UploadStatementParams,
): Promise<UploadStatementResult> {
  const {
    orgId,
    userId,
    file,
    importBatchId,
    linkedAccountId,
    classificationMode = 'manual',
    processSpreadsheetOnUpload = true,
  } = params;

  const isPdf = file.type === 'application/pdf';
  const isCsv = file.type === 'text/csv';

  if (!isPdf && !isCsv) {
    throw new Error('Unsupported file type. Only PDF and CSV files are allowed.');
  }

  if (isPdf && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Invalid file extension. PDF files must end with .pdf');
  }

  if (isCsv && !file.name.toLowerCase().endsWith('.csv')) {
    throw new Error('Invalid file extension. CSV files must end with .csv');
  }

  const maxSizeBytes = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    const maxLabel = isPdf ? '10MB' : '5MB';
    throw new Error(`File size exceeds ${maxLabel} limit`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileChecksum = createHash('sha256').update(Buffer.from(arrayBuffer)).digest('hex');

  if (isPdf) {
    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 16));
    const signature = [0x25, 0x50, 0x44, 0x46, 0x2d];
    let hasPdfSignature = false;

    for (let offset = 0; offset <= headerBytes.length - signature.length; offset += 1) {
      let match = true;
      for (let i = 0; i < signature.length; i += 1) {
        if (headerBytes[offset + i] !== signature[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        hasPdfSignature = true;
        break;
      }
    }

    if (!hasPdfSignature) {
      throw new Error('Invalid PDF file');
    }

    const pdfResult = await extractTextFromPdf(Buffer.from(arrayBuffer));

    const maxPages = 200;
    if (pdfResult.pageCount > maxPages) {
      throw new Error(`PDF exceeds maximum page limit (${maxPages})`);
    }

    if (!pdfResult.text.trim()) {
      throw new Error(
        'Could not extract any text from this PDF. If it is a scanned statement, OCR is not supported yet.',
      );
    }

    const redactedSourceText = redactHighRiskPII(pdfResult.text);
    const resolved = resolveStatementType({
      mode: classificationMode,
      statementType: params.statementType,
      fileName: file.name,
      text: redactedSourceText,
      accounts: params.accounts,
      linkedAccountId: linkedAccountId ?? null,
    });
    const data: NewStatementImport = {
      orgId,
      uploadedBy: userId,
      importBatchId,
      linkedAccountId: resolved.linkedAccountId ?? null,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      fileChecksum,
      sourceText: redactedSourceText,
      sourcePageCount: pdfResult.pageCount,
      sourceInfo: withClassification(pdfResult.info, resolved.classification),
      status: 'uploaded',
      statementType: resolved.statementType,
    };

    const statementImport = await createStatementImport(data);

    return { statementImport, classification: resolved.classification };
  }

  const redactedSourceText = redactHighRiskPII(Buffer.from(arrayBuffer).toString('utf8'));
  const resolved = resolveStatementType({
    mode: classificationMode,
    statementType: params.statementType,
    fileName: file.name,
    text: redactedSourceText,
    accounts: params.accounts,
    linkedAccountId: linkedAccountId ?? null,
  });
  const data: NewStatementImport = {
    orgId,
    uploadedBy: userId,
    importBatchId,
    linkedAccountId: resolved.linkedAccountId ?? null,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    fileChecksum,
    sourceText: redactedSourceText,
    sourcePageCount: null,
    sourceInfo: withClassification(null, resolved.classification),
    status: 'uploaded',
    statementType: resolved.statementType,
  };

  const statementImport = await createStatementImport(data);

  if (!processSpreadsheetOnUpload) {
    return { statementImport, classification: resolved.classification };
  }

  const processed = await processSpreadsheetStatementImport({
    orgId,
    statementImportId: statementImport.id,
  });

  return { statementImport: processed.statementImport, classification: resolved.classification };
}

export async function processSpreadsheetStatementImport(params: {
  orgId: number;
  statementImportId: string;
}): Promise<{ statementImport: StatementImport; transactionCount: number }> {
  const statementImport = await getStatementImportById(params.statementImportId, params.orgId);
  if (!statementImport) {
    throw new Error('Statement import not found');
  }

  if (statementImport.mimeType !== 'text/csv') {
    throw new Error('Only CSV statement imports can be processed with the spreadsheet parser');
  }

  if (statementImport.status !== 'uploaded') {
    throw new Error(`Cannot process spreadsheet: status is ${statementImport.status}`);
  }

  if (
    statementImport.statementType !== 'bank_statement' &&
    statementImport.statementType !== 'credit_card_statement'
  ) {
    throw new Error('Bank or credit card statement type is required before spreadsheet parsing');
  }

  if (!statementImport.sourceText?.trim()) {
    throw new Error('No stored spreadsheet text found for this import. Please re-upload it.');
  }

  const { transactions, statementStartDate, statementEndDate } = parseSpreadsheetStatement({
    fileName: statementImport.fileName,
    buffer: Buffer.from(statementImport.sourceText, 'utf8'),
    statementType: statementImport.statementType,
  });

  const parsedTransactions: NewParsedTransaction[] = transactions.map((transaction, index) => ({
    statementImportId: statementImport.id,
    orgId: params.orgId,
    lineNumber: index + 1,
    transactionDate: toUtcDateFromYmd(transaction.date),
    rawDescription: transaction.rawDescription,
    description: transaction.description,
    normalizedDescription: normalizeStatementDescription(transaction.description),
    amountCents: transaction.amountCents,
    checkNumber: transaction.checkNumber ?? null,
  }));

  await createParsedTransactions(parsedTransactions);

  const update: Parameters<typeof updateStatementImport>[2] = {
    status: 'extracted',
    sourceInfo: {
      ...sourceInfoObject(statementImport.sourceInfo),
      reconciliation: {
        status: 'warning',
        expectedDeltaCents: null,
        capturedDeltaCents: parsedTransactions.reduce(
          (sum, transaction) => sum + transaction.amountCents,
          0,
        ),
        diffCents: null,
        details: {
          reason: 'missing_balances',
          note: 'Spreadsheet imports do not currently extract beginning/ending balances.',
          transactionCount: parsedTransactions.length,
        },
      },
    },
  };

  if (statementStartDate) {
    update.statementStartDate = statementStartDate;
  }
  if (statementEndDate) {
    update.statementEndDate = statementEndDate;
  }

  await updateStatementImport(statementImport.id, params.orgId, update);

  try {
    await autoCategorizeParsedTransactions({
      orgId: params.orgId,
      statementImportId: statementImport.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `[statement-import:${statementImport.id}] auto-categorization failed (spreadsheet): ${message}`,
    );
    await updateStatementImport(statementImport.id, params.orgId, {
      errorMessage: message,
    });
  }

  const updated = await getStatementImportById(statementImport.id, params.orgId);
  return {
    statementImport: updated ?? statementImport,
    transactionCount: parsedTransactions.length,
  };
}
