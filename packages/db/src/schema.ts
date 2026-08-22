import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
