// This file is the public export list for the split statement-import service.
// It keeps one stable import path while the real work now lives in smaller
// modules for upload, extraction, and categorization.

export { processSpreadsheetStatementImport, uploadStatement } from './upload';
export { extractStatement } from './extract';
export { autoCategorizeParsedTransactions } from './categorization';
