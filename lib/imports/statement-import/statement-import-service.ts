// This file is a compatibility entry point for older statement-import imports.
// It re-exports the new split service modules so callers can keep the same
// import path while the implementation stays easier to maintain.

export * from './statement-import-service/index';
