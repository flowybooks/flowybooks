# User Guide

This guide uses the default Flowybooks UI and synthetic examples. Do not upload
real bank statements while testing a public fork or demo database.

## Standard Chart Of Accounts

1. Sign in and open **Chart of Accounts**.
2. Click **Apply Standard CoA**.
3. Review the account list.
4. Keep system equity accounts such as Retained Earnings, Opening Balance
   Equity, and Prior Period Adjustments in place.

The standard chart includes common accounts such as:

- `11000 - Bank Account`
- `21000 - Credit Card Payable`
- `40000 - Sales`
- `60000 - Operating Expense`

## Statement Accounts

The **Statement** checkbox marks accounts that can receive uploaded statement
imports.

For bank statements:

1. Open **Chart of Accounts**.
2. Find the bank or cash account, for example `11000 - Bank Account`.
3. Check **Statement**.
4. Keep **Active** checked.

For credit card statements:

1. Open **Chart of Accounts**.
2. Find the credit card liability account, for example
   `21000 - Credit Card Payable`.
3. Check **Statement**.
4. Keep **Active** checked.

If an account does not appear in the statement upload account selector, confirm
that both **Active** and **Statement** are checked.

## Upload A Bank Statement

1. Open **Bank Import**.
2. Select the bank account from **Account**.
3. Select **Bank** as the statement type.
4. Upload a CSV or PDF statement.
5. Open the import row when it appears in the table.
6. Review extracted transactions.
7. Categorize each transaction to the correct income, expense, asset, liability,
   or equity account.
8. Exclude duplicates or transactions you do not want posted.
9. Click **Post to Journal** when the import is linked to a statement account and
   transactions are categorized.

CSV imports work without AI. PDF extraction requires AI to be configured.

## Upload A Credit Card Statement

1. Open **Bank Import**.
2. Select the credit card account from **Account**, for example
   `21000 - Credit Card Payable`.
3. Select **Credit Card** as the statement type.
4. Upload a CSV or PDF statement.
5. Open the import row.
6. Categorize charges and refunds to the correct accounts.
7. Treat credit card payments carefully. If you also import the matching bank
   statement, categorize payments to the credit card account or exclude one side
   so cash is not double-counted.
8. Click **Post to Journal** after review.

Credit card statement uploads interpret purchases and payments differently from
bank statements, so always choose the correct statement type before uploading.

## Book A Manual Journal Entry

1. Open **Journal**.
2. Click **New Entry**.
3. Enter a narration, such as `Monthly revenue entry`.
4. Add one or more lines with:
   - GL Date
   - Account
   - Description
   - Debit or Credit
5. Make sure total debits equal total credits.
6. If multiple GL dates are used in one batch, each date must balance.
7. Click **Save Draft**.
8. Open the draft from the journal list and post it after review.

Use the opening balance and prior-period adjustment flows for those specific
accounting events instead of ordinary journal entries.

## Use Kevin

Open **Kevin** for basic bookkeeping questions, document uploads, statement
classification, document Q&A, and simple journal-entry proposals. Kevin is
experimental and can draft entries, but posting requires a final confirmation
button.

When you upload a statement to Kevin without written instructions, Kevin should
classify the file and ask what you want to do next. He should not silently
extract, categorize, or post.

Kevin can use org-scoped memory and indexed document chunks for context, but he
does not replace professional review and should not be treated as reliable for
advisory work, tax research, GAAP research, or complex import workflows.
Advisory, tax, and GAAP-style answers are source-gated. If allowed official
sources are missing, treat the answer as educational or blocked.

## Run Reports

Open **Reports** and choose:

- **Trial Balance** for account-level balances over a period.
- **Balance Sheet** for assets, liabilities, equity, retained earnings, and
  current-year earnings as of a date.
- **Income Statement** for revenue and expenses over a period.
- **General Ledger** for posted line-level activity.

Reports use posted journal activity. Draft entries do not affect reports until
they are posted.

## Troubleshooting

- **No account in the upload selector:** mark the account **Active** and
  **Statement** on the chart of accounts.
- **PDF extraction is disabled:** configure `AI_PROVIDER`, or use CSV imports.
- **AI is configured but extraction fails:** confirm your hosted API key or local
  Ollama server is working.
- **Post button is disabled:** link a statement account and categorize at least
  one included transaction.
- **Journal entry cannot save:** make sure debits and credits balance overall
  and per GL date.
