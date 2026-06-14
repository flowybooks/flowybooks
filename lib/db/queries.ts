// This file is a compatibility wrapper for the old query import path.
// It forwards exports from the new lib/db/queries/ folder so we can
// split the giant file without breaking existing imports right away.
export * from './queries/index';
