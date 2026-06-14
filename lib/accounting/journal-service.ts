// This file is a compatibility entry point for older journal-service imports.
// It simply re-exports the new split service modules so existing code can
// keep working while the internals stay organized in smaller files.

export * from './journal-service/index';
