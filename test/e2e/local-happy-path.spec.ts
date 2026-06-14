import { expect, test, type Page } from '@playwright/test';

async function selectAccountByCode(page: Page, selectName: string, code: string) {
  const option = page.locator(`select[name="${selectName}"] option`, {
    hasText: new RegExp(`^${code}\\b`),
  });
  await expect(option).toHaveCount(1);
  const value = await option.first().getAttribute('value');
  expect(value).toBeTruthy();
  await page.locator(`select[name="${selectName}"]`).selectOption(value!);
}

test('local app happy path: signup, CoA, journal, reports, statement import', async ({ page }) => {
  test.setTimeout(120_000);

  const unique = Date.now();
  const email = `flowybooks-e2e-${unique}@example.com`;
  const password = 'LocalOnly123!';
  const orgName = `Flowybooks E2E ${unique}`;

  await page.goto('/sign-up');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Name (optional)').fill('Flowybooks E2E');
  await page.getByLabel('Organization name').fill(orgName);
  await page.getByRole('button', { name: 'Create account' }).click();

  await page.waitForURL(/\/dashboard\/reports\/balance-sheet/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'Balance Sheet' })).toBeVisible();

  await page.goto('/dashboard/accounts');
  await expect(page.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply Standard CoA' }).click();
  await expect(page.getByText('10000')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Retained Earnings' }).first()).toBeVisible();

  await page.goto('/dashboard/journal/new');
  await expect(page.getByRole('heading', { name: 'New Journal' })).toBeVisible();
  await page.getByLabel('Narration (batch description)').fill('E2E service revenue');
  await page.locator('input[name="lineGlDate_0"]').fill('2026-06-30');
  await selectAccountByCode(page, 'accountId_0', '10000');
  await page.locator('input[name="lineDescription_0"]').fill('Cash received');
  await page.locator('input[name="debit_0"]').fill('100.00');
  await page.locator('input[name="lineGlDate_1"]').fill('2026-06-30');
  await selectAccountByCode(page, 'accountId_1', '40000');
  await page.locator('input[name="lineDescription_1"]').fill('Service sale');
  await page.locator('input[name="credit_1"]').fill('100.00');
  await page.getByRole('button', { name: 'Save Draft' }).click();

  await expect(page.getByRole('heading', { name: 'E2E service revenue' })).toBeVisible();
  await page.getByRole('button', { name: 'Post Journal' }).click();
  await expect(page.getByText('Posted')).toBeVisible();

  await page.goto('/dashboard/reports/balance-sheet?asOf=2026-06-30');
  await expect(page.getByRole('heading', { name: 'Balance Sheet' })).toBeVisible();
  await expect(page.getByText('Cash')).toBeVisible();
  await expect(page.getByText('$100.00').first()).toBeVisible();

  await page.goto('/dashboard/statement-imports/new');
  await expect(page.getByRole('heading', { name: 'Upload Statement' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e-bank-statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Date,Description,Amount\n2026-06-30,E2E Deposit,100.00\n'),
  });
  await page.getByRole('button', { name: 'Upload Statement' }).click();
  await page.waitForURL(/\/dashboard\/statement-imports$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Bank Import' })).toBeVisible();
  await expect(
    page.getByText('e2e-bank-statement.csv').or(page.getByText('Unlinked account')),
  ).toBeVisible();
});
