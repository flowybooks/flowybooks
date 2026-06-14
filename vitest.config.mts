import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${projectRootDir}/` }],
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts', 'test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'lib/accounting/accounts-import.ts',
        'lib/accounting/journal-export.ts',
        'lib/accounting/journals.ts',
        'lib/accounting/reports/fiscal-year.ts',
        'lib/auth/api.ts',
        'lib/imports/statement-import/date-utils.ts',
        'lib/imports/statement-import/extraction-normalizer.ts',
        'lib/imports/statement-import/fuzzy-reconciliation.ts',
        'lib/imports/statement-import/spreadsheet-parser.ts',
        'lib/imports/statement-import/statement-classifier.ts',
        'lib/imports/statement-import/transaction-normalizer.ts',
        'lib/kevin/source-tiers.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.integration.test.ts', '**/*.d.ts'],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 65,
      },
    },
  },
});
