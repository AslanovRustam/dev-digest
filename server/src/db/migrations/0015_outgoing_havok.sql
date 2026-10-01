CREATE INDEX "conventions_scan_idx" ON "conventions" USING btree ("scan_id");--> statement-breakpoint
CREATE INDEX "conventions_skill_idx" ON "conventions" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_status_chk" CHECK ("conventions"."status" in ('pending', 'accepted', 'rejected'));--> statement-breakpoint
ALTER TABLE "conventions" ADD CONSTRAINT "conventions_category_chk" CHECK ("conventions"."category" in ('naming', 'async', 'error-handling', 'imports', 'architecture', 'typing', 'testing', 'style', 'api', 'other'));