import { chromium, type Page } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.FLOWYBOOKS_BASE_URL ?? 'http://localhost:3000';
const OUTPUT_DIR =
  process.env.FLOWYBOOKS_VIDEO_DIR ?? path.join(process.cwd(), 'artifacts', 'videos');
const DEMO_DIR = path.join(process.cwd(), 'artifacts', 'video-demo');
const VIEWPORT = { width: 1440, height: 1000 };

async function pause(page: Page, ms = 800) {
  await page.waitForTimeout(ms);
}

async function clickIfVisible(page: Page, name: string) {
  const button = page.getByRole('button', { name });
  if ((await button.count()) > 0 && (await button.first().isVisible())) {
    await button.first().click();
  }
}

async function markStatementAccount(page: Page, accountName: string) {
  const row = page.locator('tr').filter({ hasText: accountName });
  const checkbox = row.getByLabel('Statement');
  if ((await checkbox.count()) > 0) {
    await checkbox.first().check();
    await pause(page, 600);
  }
}

async function uploadStatement(
  page: Page,
  filePath: string,
  accountLabel: string,
  statementType: 'Bank' | 'Credit Card',
) {
  await page.goto(`${BASE_URL}/dashboard/statement-imports`);
  await page.getByLabel('Account').selectOption({ label: accountLabel });
  await page.getByLabel(statementType).check();
  await pause(page, 500);
  await page.locator('input[type="file"][name="file"]').setInputFiles(filePath);
  await pause(page, 1600);
}

async function createDemoFiles() {
  await fs.mkdir(DEMO_DIR, { recursive: true });

  const bankCsvPath = path.join(DEMO_DIR, 'demo-bank-statement.csv');
  const creditCardCsvPath = path.join(DEMO_DIR, 'demo-credit-card-statement.csv');

  await fs.writeFile(
    bankCsvPath,
    [
      'Date,Description,Amount',
      '2026-01-05,Customer payment,2500.00',
      '2026-01-06,Software service,-120.00',
      '2026-01-07,Office supplies,-75.50',
    ].join('\n'),
  );

  await fs.writeFile(
    creditCardCsvPath,
    [
      'Date,Description,Amount',
      '2026-01-10,Cloud hosting,89.00',
      '2026-01-12,Team lunch,64.25',
      '2026-01-20,Payment received,-153.25',
    ].join('\n'),
  );

  return { bankCsvPath, creditCardCsvPath };
}

async function run() {
  const { bankCsvPath, creditCardCsvPath } = await createDemoFiles();
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: process.env.FLOWYBOOKS_VIDEO_HEADLESS !== 'false',
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: OUTPUT_DIR,
      size: VIEWPORT,
    },
  });
  const page = await context.newPage();
  const video = page.video();

  const email = `video-${Date.now()}@example.com`;

  await page.goto(`${BASE_URL}/sign-up`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo-password-1234');
  await page.getByLabel('Name (optional)').fill('Demo User');
  await page.getByLabel('Organization name').fill('Demo Books LLC');
  await pause(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/dashboard/, { timeout: 15_000 });
  await pause(page, 1200);

  await page.goto(`${BASE_URL}/dashboard/accounts`);
  await pause(page);
  await clickIfVisible(page, 'Apply Standard CoA');
  await page.waitForLoadState('networkidle');
  await pause(page, 1200);
  await markStatementAccount(page, 'Bank Account');
  await markStatementAccount(page, 'Credit Card Payable');

  await uploadStatement(page, bankCsvPath, '11000 - Bank Account', 'Bank');
  await uploadStatement(page, creditCardCsvPath, '21000 - Credit Card Payable', 'Credit Card');

  const firstImportLink = page
    .getByRole('table')
    .getByRole('link')
    .filter({ hasText: /Bank Account|Credit Card Payable/ })
    .first();
  if ((await firstImportLink.count()) > 0) {
    await firstImportLink.click();
    await pause(page, 1200);
    await clickIfVisible(page, 'All');
    await pause(page);

    const categorySelect = page.locator('table select').first();
    if ((await categorySelect.count()) > 0) {
      await categorySelect.selectOption({ label: '60000 - Operating Expense' });
      await pause(page, 1200);
    }
  }

  await page.goto(`${BASE_URL}/dashboard/journal/new`);
  await page.getByLabel('Narration (batch description)').fill('Demo revenue entry');
  await page.locator('input[name="lineGlDate_0"]').fill('2026-01-31');
  await page.locator('select[name="accountId_0"]').selectOption({ label: '10000 - Cash' });
  await page.locator('input[name="lineDescription_0"]').fill('Cash received');
  await page.locator('input[name="debit_0"]').fill('1000.00');
  await page.locator('input[name="lineGlDate_1"]').fill('2026-01-31');
  await page.locator('select[name="accountId_1"]').selectOption({ label: '40000 - Sales' });
  await page.locator('input[name="lineDescription_1"]').fill('Demo sale');
  await page.locator('input[name="credit_1"]').fill('1000.00');
  await pause(page, 1200);
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await pause(page, 1400);

  await page.goto(`${BASE_URL}/dashboard/reports/balance-sheet`);
  await pause(page, 1200);
  await page.goto(`${BASE_URL}/dashboard/reports/income-statement`);
  await pause(page, 1200);

  await context.close();
  await browser.close();

  if (video) {
    console.log(`Video saved to ${await video.path()}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
