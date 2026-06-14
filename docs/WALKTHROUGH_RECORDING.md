# Walkthrough Recording

This is a silent UI walkthrough plan for Flowybooks maintainers. The automated
recorder uses synthetic data and writes videos to ignored local artifacts.

## Recording Command

Start the app first:

```bash
bun run dev
```

In another terminal, run:

```bash
bun run record:walkthrough
```

Optional environment variables:

```env
FLOWYBOOKS_BASE_URL=http://localhost:3000
FLOWYBOOKS_VIDEO_DIR=artifacts/videos
FLOWYBOOKS_VIDEO_HEADLESS=false
```

The generated video is intentionally ignored by git.

## Demo Data Rules

- Use only synthetic users, organizations, statements, and amounts.
- Do not record terminal windows, `.env`, database URLs, browser history, or
  local private paths.
- Do not upload real bank statements or customer files.
- Prefer CSV for the public walkthrough so the video works without AI.

## Chapters

### 1. Create The Local Workspace

Screen: **Create an account**

Show:

- Email
- Password
- Name
- Organization name
- Create account

Caption:

> Create a local Flowybooks account and organization. This stores data in your
> configured PGlite database.

### 2. Apply The Standard Chart Of Accounts

Screen: **Chart of Accounts**

Show:

- Click **Apply Standard CoA**.
- Point out accounts such as Bank Account, Credit Card Payable, Sales, and
  Operating Expense.

Caption:

> Apply the standard chart of accounts to get a starter bookkeeping structure.

### 3. Mark Statement Accounts

Screen: **Chart of Accounts**

Show:

- Check **Statement** on `11000 - Bank Account`.
- Check **Statement** on `21000 - Credit Card Payable`.

Caption:

> Statement accounts are the accounts that can receive uploaded bank or credit
> card statements.

### 4. Upload A Bank Statement

Screen: **Bank Import**

Show:

- Select `11000 - Bank Account`.
- Select **Bank**.
- Upload a synthetic bank CSV.
- Open the created import.

Caption:

> Bank statement imports are linked to a bank or cash account and then reviewed
> before posting.

### 5. Upload A Credit Card Statement

Screen: **Bank Import**

Show:

- Select `21000 - Credit Card Payable`.
- Select **Credit Card**.
- Upload a synthetic credit card CSV.
- Open the created import.

Caption:

> Credit card statements use credit card amount handling. Choose the correct
> statement type before uploading.

### 6. Review And Categorize Transactions

Screen: **Statement Import Detail**

Show:

- Transaction list.
- Include/exclude checkbox.
- Category selector.
- Post button area.

Caption:

> Categorize included transactions to income, expense, asset, liability, or
> equity accounts before posting.

### 7. Book A Manual Journal Entry

Screen: **New Journal Entry**

Show:

- Narration.
- GL Date.
- Debit line to Cash.
- Credit line to Sales.
- Balanced totals.
- Save Draft.

Caption:

> Manual journal entries must balance. Drafts can be reviewed before posting.

### 8. Run Reports

Screens:

- **Balance Sheet**
- **Income Statement**
- Optional: **Trial Balance** and **General Ledger**

Caption:

> Posted journals and statement imports flow into the core financial reports.

## Review Checklist

- The video shows only synthetic data.
- The app URL is local or demo-safe.
- No terminal secrets or env files appear.
- The chart of accounts and statement account checkboxes are visible.
- Both bank and credit card statement type selections are visible.
- The final report screens are readable.
