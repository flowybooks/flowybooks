const KEVIN_APPLY_STANDARD_COA_WORDS =
  /\b(apply|set\s*up|setup|load|install|import|use)\b[\s\S]{0,80}\b(standard\s+)?(chart\s+of\s+accounts|coa)\b/i;
const KEVIN_COA_HOW_TO_WORDS = /\b(how|where|what|can you explain|show me)\b/i;
const KEVIN_ADD_ACCOUNTS_WORDS =
  /\b(add|create|set\s*up|setup|make|include)\b[\s\S]{0,160}\b(account|accounts|chart of accounts|coa|payable|expense|inventory|revenue|asset|liability)\b/i;
const KEVIN_UNDO_LAST_WORDS =
  /\b(undo|revert|reverse|roll\s*back|rollback)\b[\s\S]{0,80}\b(last|latest|previous|journal|entry|action)\b/i;
const KEVIN_REDO_LAST_WORDS =
  /\b(redo|replay|restore|reapply|repost)\b[\s\S]{0,80}\b(last|latest|previous|journal|entry|action)\b/i;

export type KevinHistoryOperation = 'undo' | 'redo';

export function shouldApplyStandardCoaFromMessage(message: string): boolean {
  return KEVIN_APPLY_STANDARD_COA_WORDS.test(message) && !KEVIN_COA_HOW_TO_WORDS.test(message);
}

export function shouldAddAccountsFromMessage(message: string): boolean {
  return KEVIN_ADD_ACCOUNTS_WORDS.test(message) && !KEVIN_COA_HOW_TO_WORDS.test(message);
}

export function requestedKevinHistoryAction(message: string): KevinHistoryOperation | null {
  const wantsUndo = KEVIN_UNDO_LAST_WORDS.test(message);
  const wantsRedo = KEVIN_REDO_LAST_WORDS.test(message);
  if (wantsUndo === wantsRedo) return null;
  return wantsUndo ? 'undo' : 'redo';
}
