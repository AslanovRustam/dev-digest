ALTER TABLE "conventions" DROP CONSTRAINT "conventions_scan_id_convention_scans_id_fk";
--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_scan_id_convention_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."convention_scans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convention_scans_ws_idx" ON "convention_scans" USING btree ("workspace_id");