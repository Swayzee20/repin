import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type WorkoutConfig = Record<string, unknown>;

export const workoutDefinitionSourceTypes = [
  "manual",
  "ai_generated",
  "photo_import",
] as const;

export const workoutBlockTypes = [
  "straight_sets",
  "rounds",
  "for_time",
  "amrap",
  "emom",
  "interval",
  "work",
  "rest",
  "freeform",
] as const;

export const workoutSessionMetricTypes = [
  "duration",
  "distance",
  "calories",
  "rounds",
  "score",
  "pace",
  "other",
] as const;

export const communityPostReactionTypes = ["fire", "strong", "clap"] as const;

export const users = pgTable("users", {
  id: uuid().primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const groupMemberRole = pgEnum("group_member_role", [
  "owner",
  "member",
]);

export const groups = pgTable(
  "groups",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    inviteCode: text("invite_code").notNull().unique(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("groups_owner_id_idx").on(table.ownerId)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: groupMemberRole().notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_members_user_id_idx").on(table.userId),
  ],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    workoutType: text("workout_type").notNull(),
    title: text().notNull(),
    name: text(),
    durationMinutes: integer("duration_minutes"),
    effort: integer(),
    caption: text(),
    photoPath: text("photo_path"),
    notes: text(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("workouts_group_completed_at_idx").on(
      table.groupId,
      table.completedAt,
    ),
    index("workouts_group_occurred_at_idx").on(
      table.groupId,
      table.occurredAt,
    ),
    index("workouts_user_id_idx").on(table.userId),
    check("workouts_effort_range_check", sql`${table.effort} is null or ${table.effort} between 1 and 5`),
  ],
);

export const movements = pgTable(
  "movements",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    category: text(),
    equipment: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("movements_name_idx").on(table.name)],
);

export const workoutDefinitions = pgTable(
  "workout_definitions",
  {
    id: uuid().defaultRandom().primaryKey(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text().notNull(),
    description: text(),
    sourceType: text("source_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("workout_definitions_created_by_user_id_idx").on(
      table.createdByUserId,
    ),
    check(
      "workout_definitions_source_type_check",
      sql`${table.sourceType} in ('manual', 'ai_generated', 'photo_import')`,
    ),
  ],
);

export const workoutBlocks = pgTable(
  "workout_blocks",
  {
    id: uuid().defaultRandom().primaryKey(),
    workoutDefinitionId: uuid("workout_definition_id")
      .notNull()
      .references(() => workoutDefinitions.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    type: text().notNull(),
    title: text(),
    rounds: integer(),
    durationSeconds: integer("duration_seconds"),
    config: jsonb().$type<WorkoutConfig>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("workout_blocks_workout_definition_id_idx").on(
      table.workoutDefinitionId,
    ),
    uniqueIndex("workout_blocks_definition_position_unique").on(
      table.workoutDefinitionId,
      table.position,
    ),
    check("workout_blocks_position_check", sql`${table.position} >= 0`),
    check(
      "workout_blocks_type_check",
      sql`${table.type} in ('straight_sets', 'rounds', 'for_time', 'amrap', 'emom', 'interval', 'work', 'rest', 'freeform')`,
    ),
    check(
      "workout_blocks_rounds_check",
      sql`${table.rounds} is null or ${table.rounds} > 0`,
    ),
    check(
      "workout_blocks_duration_seconds_check",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} > 0`,
    ),
  ],
);

export const blockMovements = pgTable(
  "block_movements",
  {
    id: uuid().defaultRandom().primaryKey(),
    workoutBlockId: uuid("workout_block_id")
      .notNull()
      .references(() => workoutBlocks.id, { onDelete: "cascade" }),
    movementId: uuid("movement_id").references(() => movements.id, {
      onDelete: "set null",
    }),
    movementName: text("movement_name").notNull(),
    position: integer().notNull(),
    targetSets: integer("target_sets"),
    targetRepsMin: integer("target_reps_min"),
    targetRepsMax: integer("target_reps_max"),
    targetSeconds: integer("target_seconds"),
    targetDistance: numeric("target_distance", {
      precision: 12,
      scale: 3,
      mode: "number",
    }),
    targetCalories: integer("target_calories"),
    targetLoad: numeric("target_load", {
      precision: 12,
      scale: 3,
      mode: "number",
    }),
    repType: text("rep_type"),
    isShared: boolean("is_shared").default(false).notNull(),
    participant: text(),
    notes: text(),
    config: jsonb().$type<WorkoutConfig>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("block_movements_workout_block_id_idx").on(table.workoutBlockId),
    index("block_movements_movement_id_idx").on(table.movementId),
    uniqueIndex("block_movements_block_position_unique").on(
      table.workoutBlockId,
      table.position,
    ),
    check("block_movements_position_check", sql`${table.position} >= 0`),
    check(
      "block_movements_target_sets_check",
      sql`${table.targetSets} is null or ${table.targetSets} > 0`,
    ),
    check(
      "block_movements_target_reps_min_check",
      sql`${table.targetRepsMin} is null or ${table.targetRepsMin} > 0`,
    ),
    check(
      "block_movements_target_reps_max_check",
      sql`${table.targetRepsMax} is null or ${table.targetRepsMax} > 0`,
    ),
    check(
      "block_movements_target_reps_range_check",
      sql`${table.targetRepsMin} is null or ${table.targetRepsMax} is null or ${table.targetRepsMax} >= ${table.targetRepsMin}`,
    ),
    check(
      "block_movements_target_seconds_check",
      sql`${table.targetSeconds} is null or ${table.targetSeconds} > 0`,
    ),
    check(
      "block_movements_target_distance_check",
      sql`${table.targetDistance} is null or ${table.targetDistance} > 0`,
    ),
    check(
      "block_movements_target_calories_check",
      sql`${table.targetCalories} is null or ${table.targetCalories} > 0`,
    ),
    check(
      "block_movements_target_load_check",
      sql`${table.targetLoad} is null or ${table.targetLoad} > 0`,
    ),
  ],
);

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workoutDefinitionId: uuid("workout_definition_id").references(
      () => workoutDefinitions.id,
      { onDelete: "set null" },
    ),
    workoutType: text("workout_type").notNull(),
    name: text(),
    durationMinutes: integer("duration_minutes"),
    effort: integer(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("workout_sessions_user_occurred_at_idx").on(
      table.userId,
      table.occurredAt,
    ),
    index("workout_sessions_workout_definition_id_idx").on(
      table.workoutDefinitionId,
    ),
    check(
      "workout_sessions_effort_range_check",
      sql`${table.effort} is null or ${table.effort} between 1 and 5`,
    ),
  ],
);

export const workoutSessionMetrics = pgTable(
  "workout_session_metrics",
  {
    id: uuid().defaultRandom().primaryKey(),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    metricType: text("metric_type").notNull(),
    label: text(),
    numericValue: numeric("numeric_value", {
      precision: 14,
      scale: 3,
      mode: "number",
    }),
    textValue: text("text_value"),
    unit: text(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("workout_session_metrics_workout_session_id_idx").on(
      table.workoutSessionId,
    ),
    uniqueIndex("workout_session_metrics_session_position_unique").on(
      table.workoutSessionId,
      table.position,
    ),
    check(
      "workout_session_metrics_position_check",
      sql`${table.position} >= 0`,
    ),
    check(
      "workout_session_metrics_metric_type_check",
      sql`${table.metricType} in ('duration', 'distance', 'calories', 'rounds', 'score', 'pace', 'other')`,
    ),
    check(
      "workout_session_metrics_value_check",
      sql`${table.numericValue} is not null or ${table.textValue} is not null`,
    ),
  ],
);

export const sessionMovementResults = pgTable(
  "session_movement_results",
  {
    id: uuid().defaultRandom().primaryKey(),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    blockMovementId: uuid("block_movement_id").references(
      () => blockMovements.id,
      { onDelete: "set null" },
    ),
    movementId: uuid("movement_id").references(() => movements.id, {
      onDelete: "set null",
    }),
    movementName: text("movement_name").notNull(),
    position: integer().notNull(),
    notes: text(),
    config: jsonb().$type<WorkoutConfig>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("session_movement_results_workout_session_id_idx").on(
      table.workoutSessionId,
    ),
    index("session_movement_results_block_movement_id_idx").on(
      table.blockMovementId,
    ),
    index("session_movement_results_movement_id_idx").on(table.movementId),
    uniqueIndex("session_movement_results_session_position_unique").on(
      table.workoutSessionId,
      table.position,
    ),
    check(
      "session_movement_results_position_check",
      sql`${table.position} >= 0`,
    ),
  ],
);

export const setResults = pgTable(
  "set_results",
  {
    id: uuid().defaultRandom().primaryKey(),
    sessionMovementResultId: uuid("session_movement_result_id")
      .notNull()
      .references(() => sessionMovementResults.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    reps: integer(),
    load: numeric({ precision: 12, scale: 3, mode: "number" }),
    loadUnit: text("load_unit"),
    durationSeconds: integer("duration_seconds"),
    distance: numeric({ precision: 12, scale: 3, mode: "number" }),
    distanceUnit: text("distance_unit"),
    calories: integer(),
    completed: boolean().default(true).notNull(),
    notes: text(),
    config: jsonb().$type<WorkoutConfig>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("set_results_session_movement_result_id_idx").on(
      table.sessionMovementResultId,
    ),
    uniqueIndex("set_results_movement_position_unique").on(
      table.sessionMovementResultId,
      table.position,
    ),
    check("set_results_position_check", sql`${table.position} >= 0`),
    check("set_results_reps_check", sql`${table.reps} is null or ${table.reps} >= 0`),
    check("set_results_load_check", sql`${table.load} is null or ${table.load} >= 0`),
    check(
      "set_results_duration_seconds_check",
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`,
    ),
    check(
      "set_results_distance_check",
      sql`${table.distance} is null or ${table.distance} >= 0`,
    ),
    check(
      "set_results_calories_check",
      sql`${table.calories} is null or ${table.calories} >= 0`,
    ),
  ],
);

export const communityPosts = pgTable(
  "community_posts",
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    workoutSessionId: uuid("workout_session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    caption: text(),
    photoPath: text("photo_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("community_posts_group_created_at_idx").on(
      table.groupId,
      table.createdAt,
    ),
    index("community_posts_workout_session_id_idx").on(
      table.workoutSessionId,
    ),
    uniqueIndex("community_posts_group_session_unique").on(
      table.groupId,
      table.workoutSessionId,
    ),
  ],
);

export const communityPostReactions = pgTable(
  "community_post_reactions",
  {
    id: uuid().defaultRandom().primaryKey(),
    communityPostId: uuid("community_post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reactionType: text("reaction_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("community_post_reactions_post_user_unique").on(
      table.communityPostId,
      table.userId,
    ),
    index("community_post_reactions_user_id_idx").on(table.userId),
    check(
      "community_post_reactions_type_check",
      sql`${table.reactionType} in ('fire', 'strong', 'clap')`,
    ),
  ],
);

export const communityPostComments = pgTable(
  "community_post_comments",
  {
    id: uuid().defaultRandom().primaryKey(),
    communityPostId: uuid("community_post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("community_post_comments_post_created_at_idx").on(
      table.communityPostId,
      table.createdAt,
      table.id,
    ),
    index("community_post_comments_user_id_idx").on(table.userId),
    check(
      "community_post_comments_text_check",
      sql`length(btrim(${table.text})) between 1 and 2000`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type Movement = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;
export type WorkoutDefinition = typeof workoutDefinitions.$inferSelect;
export type NewWorkoutDefinition = typeof workoutDefinitions.$inferInsert;
export type WorkoutBlock = typeof workoutBlocks.$inferSelect;
export type NewWorkoutBlock = typeof workoutBlocks.$inferInsert;
export type BlockMovement = typeof blockMovements.$inferSelect;
export type NewBlockMovement = typeof blockMovements.$inferInsert;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;
export type WorkoutSessionMetric = typeof workoutSessionMetrics.$inferSelect;
export type NewWorkoutSessionMetric = typeof workoutSessionMetrics.$inferInsert;
export type SessionMovementResult = typeof sessionMovementResults.$inferSelect;
export type NewSessionMovementResult = typeof sessionMovementResults.$inferInsert;
export type SetResult = typeof setResults.$inferSelect;
export type NewSetResult = typeof setResults.$inferInsert;
export type CommunityPost = typeof communityPosts.$inferSelect;
export type NewCommunityPost = typeof communityPosts.$inferInsert;
export type CommunityPostReaction = typeof communityPostReactions.$inferSelect;
export type NewCommunityPostReaction = typeof communityPostReactions.$inferInsert;
export type CommunityPostComment = typeof communityPostComments.$inferSelect;
export type NewCommunityPostComment = typeof communityPostComments.$inferInsert;
