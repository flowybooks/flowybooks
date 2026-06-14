ALTER TABLE "accounts" ADD CONSTRAINT "accounts_code_format_check" CHECK ("accounts"."code" ~ '^[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_debit_nonnegative_check" CHECK ("journal_lines"."debit" >= 0);--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_credit_nonnegative_check" CHECK ("journal_lines"."credit" >= 0);--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_one_sided_amount_check" CHECK ("journal_lines"."debit" = 0 or "journal_lines"."credit" = 0);--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_nonzero_amount_check" CHECK ("journal_lines"."debit" > 0 or "journal_lines"."credit" > 0);--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_fiscal_year_end_month_check" CHECK ("organization"."fiscal_year_end_month" between 1 and 12);