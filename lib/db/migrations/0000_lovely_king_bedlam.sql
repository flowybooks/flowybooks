CREATE TYPE "public"."account_classification" AS ENUM('current_asset', 'noncurrent_asset', 'fixed_asset', 'other_asset', 'current_liability', 'noncurrent_liability', 'other_liability', 'equity', 'common_stock', 'preferred_stock', 'additional_paid_in_capital', 'treasury_stock', 'retained_earnings', 'dividends_equity', 'foreign_currency_translation', 'other_equity', 'income', 'sales', 'interest_income', 'dividend_income', 'other_income', 'expense', 'operating_expense', 'cogs', 'depreciation', 'fixed_costs', 'variable_expenses', 'other_expense');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'void', 'post', 'unpost');--> statement-breakpoint
CREATE TYPE "public"."audit_source" AS ENUM('web_ui', 'api', 'system', 'import', 'migration');--> statement-breakpoint
CREATE TYPE "public"."category_confidence" AS ENUM('high', 'medium', 'low', 'manual');--> statement-breakpoint
CREATE TYPE "public"."journal_batch_status" AS ENUM('draft', 'posted', 'voided');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'member', 'viewer', 'advisor', 'bookkeeper');--> statement-breakpoint
CREATE TYPE "public"."statement_import_status" AS ENUM('uploaded', 'extracting', 'extracted', 'reviewing', 'approved', 'imported', 'failed');--> statement-breakpoint
CREATE TYPE "public"."statement_type" AS ENUM('bank_statement', 'credit_card_statement', 'sba_loan', 'factoring_loan', 'secured_loan', 'auto_loan', 'lease');--> statement-breakpoint
CREATE TABLE "account_mapping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"description_pattern" text NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"times_used" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"code" varchar(5) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" "account_type" NOT NULL,
	"classification" "account_classification",
	"is_active" boolean DEFAULT true NOT NULL,
	"is_statement_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"previous_state" jsonb,
	"new_state" jsonb NOT NULL,
	"change_reason" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"session_id" varchar(100),
	"source" "audit_source" DEFAULT 'web_ui' NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "journal_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"description" text NOT NULL,
	"status" "journal_batch_status" DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"supersedes_batch_id" uuid,
	"source_type" varchar(50),
	"source_ref" jsonb,
	"source_ref_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"batch_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"narration" text,
	"debit" integer DEFAULT 0 NOT NULL,
	"credit" integer DEFAULT 0 NOT NULL,
	"gl_date" timestamp DEFAULT now() NOT NULL,
	"source_type" varchar(50),
	"source_ref" jsonb
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"role" "member_role" NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"books_start_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(5) NOT NULL,
	"name" varchar(100) NOT NULL,
	"tax_id" varchar(64),
	"domicile_country" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"fiscal_year_end_month" integer DEFAULT 12 NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "parsed_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"statement_import_id" uuid NOT NULL,
	"transaction_date" timestamp NOT NULL,
	"description" text NOT NULL,
	"raw_description" text NOT NULL,
	"normalized_description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"check_number" varchar(20),
	"suggested_account_id" uuid,
	"suggested_category_reason" text,
	"category_confidence" "category_confidence",
	"confirmed_account_id" uuid,
	"allocations" jsonb,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"journal_batch_id" uuid,
	"line_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"import_batch_id" varchar(36) NOT NULL,
	"linked_account_id" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_checksum" varchar(64),
	"source_text" text NOT NULL,
	"source_page_count" integer,
	"source_info" jsonb,
	"statement_type" "statement_type",
	"institution_name" varchar(255),
	"account_number" varchar(50),
	"statement_start_date" timestamp,
	"statement_end_date" timestamp,
	"beginning_balance_cents" integer,
	"ending_balance_cents" integer,
	"status" "statement_import_status" DEFAULT 'uploaded' NOT NULL,
	"extraction_model" varchar(100),
	"error_message" text,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100),
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"current_org_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_mapping_rules" ADD CONSTRAINT "account_mapping_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_team_id_organization_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_batches" ADD CONSTRAINT "journal_batches_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_batches" ADD CONSTRAINT "journal_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_batches" ADD CONSTRAINT "journal_batches_supersedes_batch_id_journal_batches_id_fk" FOREIGN KEY ("supersedes_batch_id") REFERENCES "public"."journal_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_batch_id_journal_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."journal_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_team_id_organization_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_transactions" ADD CONSTRAINT "parsed_transactions_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_transactions" ADD CONSTRAINT "parsed_transactions_statement_import_id_statement_imports_id_fk" FOREIGN KEY ("statement_import_id") REFERENCES "public"."statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_transactions" ADD CONSTRAINT "parsed_transactions_suggested_account_id_accounts_id_fk" FOREIGN KEY ("suggested_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_transactions" ADD CONSTRAINT "parsed_transactions_confirmed_account_id_accounts_id_fk" FOREIGN KEY ("confirmed_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parsed_transactions" ADD CONSTRAINT "parsed_transactions_journal_batch_id_journal_batches_id_fk" FOREIGN KEY ("journal_batch_id") REFERENCES "public"."journal_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_current_org_id_organization_id_fk" FOREIGN KEY ("current_org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_mapping_rules_org_desc_idx" ON "account_mapping_rules" USING btree ("org_id","description_pattern");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_org_id_code_unique" ON "accounts" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "accounts_org_type_idx" ON "accounts" USING btree ("org_id","type");--> statement-breakpoint
CREATE INDEX "audit_log_org_timestamp_idx" ON "audit_log" USING btree ("org_id","timestamp");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_batches_source_dedupe_idx" ON "journal_batches" USING btree ("org_id","source_type","source_ref_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_batches_one_posted_child_per_superseded_idx" ON "journal_batches" USING btree ("org_id","supersedes_batch_id") WHERE "journal_batches"."supersedes_batch_id" is not null and "journal_batches"."status" = 'posted';--> statement-breakpoint
CREATE INDEX "journal_lines_org_gl_date_idx" ON "journal_lines" USING btree ("org_id","gl_date");--> statement-breakpoint
CREATE INDEX "journal_lines_batch_id_idx" ON "journal_lines" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "member_team_id_idx" ON "member" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_settings_org_unique" ON "org_settings" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_slug_unique_idx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_public_id_unique_idx" ON "organization" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "parsed_transactions_import_org_idx" ON "parsed_transactions" USING btree ("statement_import_id","org_id");--> statement-breakpoint
CREATE INDEX "statement_imports_batch_idx" ON "statement_imports" USING btree ("import_batch_id","org_id");
