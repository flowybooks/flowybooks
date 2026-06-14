import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

const e2eEnv = {
  ...process.env,
  PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR ?? '.pglite/e2e',
  BASE_URL: baseURL,
  BETTER_AUTH_URL: baseURL,
  NEXT_PUBLIC_BETTER_AUTH_URL: baseURL,
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    'playwright-local-secret-00000000000000000000000000000000',
  CRON_SECRET: process.env.CRON_SECRET ?? 'playwright-cron-secret',
  AI_PROVIDER: process.env.AI_PROVIDER ?? '',
  FLOWYBOOKS_USER_AGENT: process.env.FLOWYBOOKS_USER_AGENT ?? 'flowybooks-e2e/0.1',
  LOCAL_AGENT_FILES_DIR: process.env.LOCAL_AGENT_FILES_DIR ?? '',
  KEVIN_INDEX_ORG_ID: process.env.KEVIN_INDEX_ORG_ID ?? '',
};

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `bun run db:migrate && bun run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: e2eEnv,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
