export const KEVIN_ACTION_TYPES = {
  applyStandardCoa: 'apply_standard_coa',
  addAccounts: 'add_accounts',
  draftJournal: 'draft_journal',
  postJournal: 'post_journal',
  redoJournal: 'redo_journal',
  timeMachineRestore: 'time_machine_restore',
} as const;

export type KevinActionType = (typeof KEVIN_ACTION_TYPES)[keyof typeof KEVIN_ACTION_TYPES];

export const KEVIN_ACTION_STATUSES = {
  applied: 'applied',
  drafted: 'drafted',
  posted: 'posted',
  restored: 'restored',
  undone: 'undone',
} as const;

export type KevinActionStatus = (typeof KEVIN_ACTION_STATUSES)[keyof typeof KEVIN_ACTION_STATUSES];
