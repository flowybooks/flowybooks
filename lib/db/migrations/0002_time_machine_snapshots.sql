CREATE TABLE "time_machine_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" integer NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"reason" varchar(60) DEFAULT 'manual' NOT NULL,
	"source_type" varchar(60),
	"source_id" varchar(100),
	"payload" jsonb NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_machine_snapshots" ADD CONSTRAINT "time_machine_snapshots_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_machine_snapshots" ADD CONSTRAINT "time_machine_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_machine_snapshots_org_created_idx" ON "time_machine_snapshots" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "time_machine_snapshots_org_source_idx" ON "time_machine_snapshots" USING btree ("org_id","source_type","source_id");
