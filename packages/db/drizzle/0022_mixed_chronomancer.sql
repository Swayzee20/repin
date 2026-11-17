ALTER TABLE "content_reports" DROP CONSTRAINT "content_reports_reporter_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "content_reports" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;