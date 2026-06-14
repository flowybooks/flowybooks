CREATE TABLE "kevin_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"thread_id" uuid,
	"user_id" integer,
	"action_type" varchar(50) NOT NULL,
	"status" varchar(30) NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"journal_batch_id" uuid,
	"undo_of_action_id" uuid,
	"redo_of_action_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"title" text NOT NULL,
	"file_name" text,
	"path_hash" varchar(64),
	"mime_type" varchar(100),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"key" varchar(120) NOT NULL,
	"value" text NOT NULL,
	"category" varchar(60) DEFAULT 'general' NOT NULL,
	"source_message_id" uuid,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"model" varchar(100),
	"provider" varchar(30),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kevin_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"title" text DEFAULT 'Kevin chat' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kevin_actions" ADD CONSTRAINT "kevin_actions_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_actions" ADD CONSTRAINT "kevin_actions_thread_id_kevin_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."kevin_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_actions" ADD CONSTRAINT "kevin_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_actions" ADD CONSTRAINT "kevin_actions_journal_batch_id_journal_batches_id_fk" FOREIGN KEY ("journal_batch_id") REFERENCES "public"."journal_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_actions" ADD CONSTRAINT "kevin_actions_undo_of_action_id_kevin_actions_id_fk" FOREIGN KEY ("undo_of_action_id") REFERENCES "public"."kevin_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_actions" ADD CONSTRAINT "kevin_actions_redo_of_action_id_kevin_actions_id_fk" FOREIGN KEY ("redo_of_action_id") REFERENCES "public"."kevin_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_document_chunks" ADD CONSTRAINT "kevin_document_chunks_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_document_chunks" ADD CONSTRAINT "kevin_document_chunks_document_id_kevin_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."kevin_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_documents" ADD CONSTRAINT "kevin_documents_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_memories" ADD CONSTRAINT "kevin_memories_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_memories" ADD CONSTRAINT "kevin_memories_source_message_id_kevin_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."kevin_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_memories" ADD CONSTRAINT "kevin_memories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_messages" ADD CONSTRAINT "kevin_messages_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_messages" ADD CONSTRAINT "kevin_messages_thread_id_kevin_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."kevin_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_threads" ADD CONSTRAINT "kevin_threads_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kevin_threads" ADD CONSTRAINT "kevin_threads_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kevin_actions_org_created_idx" ON "kevin_actions" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "kevin_actions_journal_batch_idx" ON "kevin_actions" USING btree ("journal_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kevin_document_chunks_doc_index_unique" ON "kevin_document_chunks" USING btree ("document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "kevin_document_chunks_org_document_idx" ON "kevin_document_chunks" USING btree ("org_id","document_id");--> statement-breakpoint
CREATE INDEX "kevin_documents_org_source_idx" ON "kevin_documents" USING btree ("org_id","source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "kevin_documents_org_path_unique" ON "kevin_documents" USING btree ("org_id","path_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "kevin_memories_org_key_unique" ON "kevin_memories" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "kevin_memories_org_category_idx" ON "kevin_memories" USING btree ("org_id","category");--> statement-breakpoint
CREATE INDEX "kevin_messages_thread_created_idx" ON "kevin_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "kevin_messages_org_created_idx" ON "kevin_messages" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "kevin_threads_org_updated_idx" ON "kevin_threads" USING btree ("org_id","updated_at");