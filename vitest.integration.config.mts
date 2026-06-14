import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${projectRootDir}/` }],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    env: {
      PGLITE_DATA_DIR: '.pglite/test-integration',
      BETTER_AUTH_SECRET: 'integration-test-secret-for-local-pglite-tests',
    },
    globalSetup: ['./test/setup/integration-global.ts'],
  },
});
