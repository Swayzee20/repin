ALTER TABLE "workouts" ALTER COLUMN "duration_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "effort" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "caption" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "photo_path" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
UPDATE "workouts" SET "occurred_at" = "completed_at" WHERE "occurred_at" IS NULL;--> statement-breakpoint
ALTER TABLE "workouts" ALTER COLUMN "occurred_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_effort_range_check" CHECK ("workouts"."effort" is null or "workouts"."effort" between 1 and 5);
