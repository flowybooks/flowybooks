ALTER TABLE "time_machine_snapshots" DROP CONSTRAINT "time_machine_snapshots_org_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "time_machine_snapshots" DROP CONSTRAINT "time_machine_snapshots_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "time_machine_snapshots" ADD CONSTRAINT "time_machine_snapshots_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "time_machine_snapshots" ADD CONSTRAINT "time_machine_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
