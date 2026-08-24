CREATE TABLE "block_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_block_id" uuid NOT NULL,
	"movement_id" uuid,
	"movement_name" text NOT NULL,
	"position" integer NOT NULL,
	"target_sets" integer,
	"target_reps_min" integer,
	"target_reps_max" integer,
	"target_seconds" integer,
	"target_distance" numeric(12, 3),
	"target_calories" integer,
	"target_load" numeric(12, 3),
	"rep_type" text,
	"is_shared" boolean DEFAULT false NOT NULL,
	"participant" text,
	"notes" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "block_movements_position_check" CHECK ("block_movements"."position" >= 0),
	CONSTRAINT "block_movements_target_sets_check" CHECK ("block_movements"."target_sets" is null or "block_movements"."target_sets" > 0),
	CONSTRAINT "block_movements_target_reps_min_check" CHECK ("block_movements"."target_reps_min" is null or "block_movements"."target_reps_min" > 0),
	CONSTRAINT "block_movements_target_reps_max_check" CHECK ("block_movements"."target_reps_max" is null or "block_movements"."target_reps_max" > 0),
	CONSTRAINT "block_movements_target_reps_range_check" CHECK ("block_movements"."target_reps_min" is null or "block_movements"."target_reps_max" is null or "block_movements"."target_reps_max" >= "block_movements"."target_reps_min"),
	CONSTRAINT "block_movements_target_seconds_check" CHECK ("block_movements"."target_seconds" is null or "block_movements"."target_seconds" > 0),
	CONSTRAINT "block_movements_target_distance_check" CHECK ("block_movements"."target_distance" is null or "block_movements"."target_distance" > 0),
	CONSTRAINT "block_movements_target_calories_check" CHECK ("block_movements"."target_calories" is null or "block_movements"."target_calories" > 0),
	CONSTRAINT "block_movements_target_load_check" CHECK ("block_movements"."target_load" is null or "block_movements"."target_load" > 0)
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text,
	"equipment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "workout_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_definition_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"rounds" integer,
	"duration_seconds" integer,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_blocks_position_check" CHECK ("workout_blocks"."position" >= 0),
	CONSTRAINT "workout_blocks_type_check" CHECK ("workout_blocks"."type" in ('straight_sets', 'rounds', 'for_time', 'amrap', 'emom', 'interval', 'work', 'rest', 'freeform')),
	CONSTRAINT "workout_blocks_rounds_check" CHECK ("workout_blocks"."rounds" is null or "workout_blocks"."rounds" > 0),
	CONSTRAINT "workout_blocks_duration_seconds_check" CHECK ("workout_blocks"."duration_seconds" is null or "workout_blocks"."duration_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "workout_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"source_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_definitions_source_type_check" CHECK ("workout_definitions"."source_type" in ('manual', 'ai_generated', 'photo_import'))
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "workout_definition_id" uuid;--> statement-breakpoint
ALTER TABLE "block_movements" ADD CONSTRAINT "block_movements_workout_block_id_workout_blocks_id_fk" FOREIGN KEY ("workout_block_id") REFERENCES "public"."workout_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_movements" ADD CONSTRAINT "block_movements_movement_id_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_blocks" ADD CONSTRAINT "workout_blocks_workout_definition_id_workout_definitions_id_fk" FOREIGN KEY ("workout_definition_id") REFERENCES "public"."workout_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_definitions" ADD CONSTRAINT "workout_definitions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "block_movements_workout_block_id_idx" ON "block_movements" USING btree ("workout_block_id");--> statement-breakpoint
CREATE INDEX "block_movements_movement_id_idx" ON "block_movements" USING btree ("movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "block_movements_block_position_unique" ON "block_movements" USING btree ("workout_block_id","position");--> statement-breakpoint
CREATE INDEX "movements_name_idx" ON "movements" USING btree ("name");--> statement-breakpoint
CREATE INDEX "workout_blocks_workout_definition_id_idx" ON "workout_blocks" USING btree ("workout_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_blocks_definition_position_unique" ON "workout_blocks" USING btree ("workout_definition_id","position");--> statement-breakpoint
CREATE INDEX "workout_definitions_created_by_user_id_idx" ON "workout_definitions" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_workout_definition_id_workout_definitions_id_fk" FOREIGN KEY ("workout_definition_id") REFERENCES "public"."workout_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_sessions_workout_definition_id_idx" ON "workout_sessions" USING btree ("workout_definition_id");