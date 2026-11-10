import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Client } = pg;
const dbPackageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const sourceUrl = process.env.DATABASE_URL
  ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

test("goal slots, auto-reach, reopen, recompute, and hand-mark share rejection", async () => {
  const testUrl = await recreateDatabase();
  process.env.DATABASE_URL = testUrl;
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await prepareDatabase(client);
    await runDrizzleMigrate(testUrl);
    await applySupabaseMigrations(client);
    await createBypassRole(client);

    const db = await import("../src/index.ts");
    const ada = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Ada" });
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    const activation = new Date(Date.now() - 60_000);

    const volume = async () => db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 10,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: activation,
    });

    const firstFive = [];
    for (let index = 0; index < 5; index += 1) firstFive.push(await volume());
    assert.equal(firstFive.length, 5);
    await assert.rejects(
      () => volume(),
      (error) => error.name === "GoalRequestError" && error.statusCode === 409,
    );

    await db.archiveGoalForUser(ada.id, firstFive[0].id);
    const extra = await volume();
    assert.equal(extra.state, "active");

    const lift = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 300,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Back Squat",
      lane: null,
      now: activation,
    }).catch(() => null);
    assert.equal(lift, null, "one-time lift needs a free slot after five actives");

    await db.archiveGoalForUser(ada.id, extra.id);
    const liftGoal = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 300,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Back Squat",
      lane: null,
      now: activation,
    });

    const posted = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Back Squat",
      name: "Back Squat",
      durationMinutes: 48,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 1, load: 315, loadUnit: "lb" }],
      }],
    });
    assert.ok(posted.goals.reached.some((item) => item.goalId === liftGoal.id));
    const afterReach = await db.listGoalsForUser(ada.id);
    assert.equal(afterReach.active.some((goal) => goal.id === liftGoal.id), false);
    assert.equal(afterReach.history.some((goal) => goal.id === liftGoal.id && goal.state === "reached"), true);

    const badges = await db.shareSessionGoalBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
    });
    assert.equal(badges.length, 1);

    const edited = await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: posted.id,
      workoutType: "strength_training",
      name: "Back Squat",
      durationMinutes: 48,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 5, load: 135, loadUnit: "lb" }],
      }],
    });
    assert.equal(edited.goals.reached.length, 0);
    assert.equal(
      await scalar(client, "select count(*)::int from community_post_goals"),
      0,
    );

    const afterInvalidate = await db.getGoalForUser(ada.id, liftGoal.id);
    assert.equal(afterInvalidate.state, "active");
    await db.archiveGoalForUser(ada.id, liftGoal.id);

    const timeGoal = await db.createGoalForUser({
      userId: ada.id,
      kind: "time",
      metric: "time",
      sportFilter: "run",
      target: 1200,
      displayUnit: "s",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: "5k",
      now: activation,
    });
    const tie = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      workoutSubtype: "distance",
      title: "5K",
      name: "5K",
      durationMinutes: 20,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1_200, unit: "s" },
      ],
    });
    assert.equal(tie.goals.reached.some((item) => item.goalId === timeGoal.id), false);
    const faster = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      workoutSubtype: "distance",
      title: "5K",
      name: "5K",
      durationMinutes: 19,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      metrics: [
        { metricType: "distance", numericValue: 5, unit: "km" },
        { metricType: "duration", numericValue: 1_199, unit: "s" },
      ],
    });
    assert.equal(faster.goals.reached.some((item) => item.goalId === timeGoal.id), true);

    const hand = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 500,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Deadlift",
      lane: null,
      now: activation,
    });
    const marked = await db.markGoalDoneForUser(ada.id, hand.id);
    assert.equal(marked.completionMethod, "manual");
    await assert.rejects(
      () => db.shareSessionGoalBadges({
        userId: ada.id,
        groupId: crew.id,
        sessionId: posted.id,
        periodIds: marked.currentPeriodId ? [marked.currentPeriodId] : undefined,
      }),
      (error) => error.name === "GoalRequestError",
    );

    await db.deleteCommunityPostForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: faster.id,
      deleteWorkout: true,
    });
    const afterDelete = await db.getGoalForUser(ada.id, timeGoal.id);
    assert.ok(afterDelete);
    assert.notEqual(afterDelete.state, "reached");

    const weekly = firstFive[1];
    const weeklyReach = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: activation,
    }).catch(() => weekly);
    const checkIn = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "other",
      title: "Quick check-in",
      name: "Quick check-in",
      durationMinutes: null,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
    });
    const weeklyAfter = await db.getGoalForUser(ada.id, weeklyReach.id);
    if (weeklyAfter.progress.current >= 1 && weeklyAfter.schedule === "weekly") {
      assert.equal(weeklyAfter.state, "active");
      assert.ok(weeklyAfter.activeSlot != null);
    }
    assert.ok(checkIn.id);

    await db.archiveGoalForUser(ada.id, weekly.id);
    await db.archiveGoalForUser(ada.id, firstFive[2].id);
    await db.archiveGoalForUser(ada.id, firstFive[3].id);
    await db.archiveGoalForUser(ada.id, firstFive[4].id);
    const reopened = await db.reopenGoalForUser({ userId: ada.id, goalId: timeGoal.id });
    assert.equal(reopened.state, "active");
    assert.ok(new Date(reopened.activationAt).getTime() >= activation.getTime());
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

test("goal review regressions for slots, frozen periods, share, and late logs", async () => {
  const testUrl = await recreateDatabase();
  process.env.DATABASE_URL = testUrl;
  if (globalThis.repinPool) {
    await globalThis.repinPool.end();
    globalThis.repinPool = undefined;
    globalThis.repinDatabase = undefined;
  }
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await prepareDatabase(client);
    await runDrizzleMigrate(testUrl);
    await applySupabaseMigrations(client);
    await createBypassRole(client);

    const { addZonedDays, formatZonedYmd, sundayWeekBounds } = await import("@repin/validation");
    const db = await import("../src/index.ts");
    const zone = "America/Chicago";
    const now = new Date();
    const currentWeek = sundayWeekBounds(now, zone);
    const previousStart = addZonedDays(currentWeek.weekStart, -7, zone);
    const previousMid = addZonedDays(previousStart, 3, zone);
    const createdAt = addZonedDays(previousStart, 1, zone);
    const ada = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Ada" });
    const byron = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Byron" });
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    const beta = await db.createGroup({ ownerId: ada.id, name: "Beta Crew" });
    await db.joinGroup({ userId: byron.id, groupId: crew.id, inviteCode: crew.inviteCode });

    await assert.rejects(
      () => client.query(
        `insert into goals (
           user_id, title, kind, metric, target_value, schedule, starts_at, time_zone, activation_at, state, active_slot
         ) values ($1, 'Null slot', 'volume', 'workout_count', 1, 'weekly', now(), 'America/Chicago', now(), 'active', null)`,
        [ada.id],
      ),
      /goals_slot_state_check|check constraint/i,
    );
    await assert.rejects(
      () => client.query(
        `insert into goals (
           user_id, title, kind, metric, target_value, schedule, starts_at, time_zone, activation_at, state, active_slot
         ) values ($1, 'Sixth', 'volume', 'workout_count', 1, 'weekly', now(), 'America/Chicago', now(), 'active', 6)`,
        [ada.id],
      ),
      /goals_slot_state_check|check constraint/i,
    );
    await assert.rejects(
      () => client.query(
        `insert into goals (
           user_id, title, kind, metric, target_value, schedule, starts_at, time_zone, activation_at, state, active_slot
         ) values ($1, 'Archived null cutoff', 'volume', 'workout_count', 1, 'weekly', now(), 'America/Chicago', now(), 'archived', null)`,
        [ada.id],
      ),
      /goals_archived_at_check|check constraint/i,
    );
    await assert.rejects(
      () => client.query(
        `insert into goals (
           user_id, title, kind, metric, target_value, schedule, starts_at, time_zone, activation_at, state, active_slot, archived_at
         ) values ($1, 'Active with cutoff', 'volume', 'workout_count', 1, 'weekly', now(), 'America/Chicago', now(), 'active', 1, now())`,
        [ada.id],
      ),
      /goals_archived_at_check|check constraint/i,
    );

    const weekly = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    await assert.rejects(
      () => client.query(
        `insert into goals (
           user_id, title, kind, metric, target_value, schedule, starts_at, time_zone, activation_at, state, active_slot
         ) values ($1, 'Dup slot', 'volume', 'workout_count', 1, 'weekly', now(), 'America/Chicago', now(), 'active', 1)`,
        [ada.id],
      ),
      /goals_user_active_slot_unique|unique/i,
    );
    const firstPeriod = await scalar(
      client,
      "select period_end from goal_periods where goal_id = $1",
      [weekly.id],
    );
    assert.ok(firstPeriod);
    const firstEndMs = new Date(firstPeriod).getTime();
    const noOp = await db.updateGoalForUser({
      userId: ada.id,
      goalId: weekly.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    assert.equal(noOp.timeZone, "America/Chicago");
    assert.equal(
      new Date(await scalar(client, "select period_end from goal_periods where goal_id = $1", [weekly.id])).getTime(),
      firstEndMs,
    );
    await assert.rejects(
      () => db.updateGoalForUser({
        userId: ada.id,
        goalId: weekly.id,
        kind: "volume",
        metric: "workout_count",
        sportFilter: null,
        target: 1,
        displayUnit: "count",
        schedule: "weekly",
        deadlineAt: null,
        timeZone: "Pacific/Kiritimati",
        movementId: null,
        movementName: null,
        lane: null,
      }),
      (error) => error.name === "GoalRequestError" && error.message.includes("time zone"),
    );

    const deadlineDay = formatZonedYmd(addZonedDays(createdAt, 10, zone), zone);
    const dated = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 12,
      displayUnit: "count",
      schedule: "one_time",
      deadlineAt: deadlineDay,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    const originalDeadline = dated.deadlineAt;
    const unchanged = await db.updateGoalForUser({
      userId: ada.id,
      goalId: dated.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 12,
      displayUnit: "count",
      schedule: "one_time",
      deadlineAt: deadlineDay,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    assert.equal(unchanged.deadlineAt, originalDeadline);

    await db.archiveGoalForUser(ada.id, dated.id);

    const expiredDeadline = formatZonedYmd(addZonedDays(previousStart, 5, zone), zone);
    const oneTime = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 3,
      displayUnit: "count",
      schedule: "one_time",
      deadlineAt: expiredDeadline,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    const afterDeadline = await db.listGoalsForUser(ada.id, now);
    const expiredGoal = afterDeadline.history.find((goal) => goal.id === oneTime.id)
      ?? afterDeadline.active.find((goal) => goal.id === oneTime.id);
    assert.equal(expiredGoal?.state, "expired");
    const reopenedDated = await db.reopenGoalForUser({
      userId: ada.id,
      goalId: oneTime.id,
      now,
    });
    assert.equal(reopenedDated.state, "active");
    assert.ok(new Date(reopenedDated.deadlineAt).getTime() > now.getTime());

    const rolled = await db.getGoalForUser(ada.id, weekly.id, now);
    assert.equal(rolled.progress.current, 0);
    assert.notEqual(rolled.currentPeriodId, weekly.currentPeriodId);

    const late = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "other",
      title: "Late log",
      name: "Late log",
      durationMinutes: null,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: previousMid,
    });
    const credited = await db.getGoalForUser(ada.id, weekly.id, now);
    assert.equal(credited.progress.current, 0);
    assert.equal(
      await scalar(
        client,
        "select state from goal_periods where goal_id = $1 and period_key = $2",
        [weekly.id, formatZonedYmd(previousStart, zone)],
      ),
      "reached",
    );

    const lift = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 300,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Back Squat",
      lane: null,
      now: createdAt,
    });
    const posted = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Back Squat",
      name: "Back Squat",
      durationMinutes: 48,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: previousMid,
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 1, load: 315, loadUnit: "lb" }],
      }],
    });
    assert.ok(posted.goals.reached.some((item) => item.goalId === lift.id));
    const shared = await db.shareSessionGoalBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: posted.id,
    });
    assert.equal(shared.length, 1);
    await client.query(
      "insert into community_posts (user_id, group_id, workout_session_id) values ($1, $2, $3)",
      [ada.id, beta.id, posted.id],
    );
    await assert.rejects(
      () => db.shareSessionGoalBadges({
        userId: ada.id,
        groupId: beta.id,
        sessionId: posted.id,
      }),
      (error) => error.name === "GoalRequestError" && error.statusCode === 403,
    );
    await db.leaveCrew({ userId: byron.id, groupId: crew.id });
    await client.query(
      "update goal_periods set originating_post_id = null where source_session_id = $1",
      [posted.id],
    );
    await assert.rejects(
      () => db.shareSessionGoalBadges({
        userId: ada.id,
        groupId: crew.id,
        sessionId: posted.id,
      }),
      (error) => error.name === "GoalRequestError" && error.statusCode === 403,
    );
    await client.query(
      "update goal_periods set originating_post_id = (select id from community_posts where workout_session_id = $1 and group_id = $2) where source_session_id = $1",
      [posted.id, crew.id],
    );

    const replacement = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Back Squat 2",
      name: "Back Squat 2",
      durationMinutes: 40,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(now.getTime() - 1_000),
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 1, load: 335, loadUnit: "lb" }],
      }],
    });
    await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: posted.id,
      workoutType: "strength_training",
      name: "Back Squat",
      durationMinutes: 48,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: previousMid,
      movements: [{
        movementName: "Back Squat",
        notes: null,
        sets: [{ reps: 5, load: 135, loadUnit: "lb" }],
      }],
    });
    assert.equal(
      await scalar(client, "select count(*)::int from community_post_goals where source_session_id = $1", [posted.id]),
      0,
    );
    assert.equal(
      await scalar(client, "select count(*)::int from community_post_goals where source_session_id = $1", [replacement.id]),
      0,
    );

    await db.archiveGoalForUser(ada.id, lift.id);
    const archivedPosted = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 200,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: "Deadlift",
      lane: null,
      now: createdAt,
    });
    const archivedWorkout = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Deadlift",
      name: "Deadlift",
      durationMinutes: 30,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(now.getTime() - 2_000),
      movements: [{
        movementName: "Deadlift",
        notes: null,
        sets: [{ reps: 1, load: 225, loadUnit: "lb" }],
      }],
    });
    assert.ok(archivedWorkout.goals.reached.some((item) => item.goalId === archivedPosted.id));
    await db.shareSessionGoalBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: archivedWorkout.id,
    });
    await db.archiveGoalForUser(ada.id, archivedPosted.id);
    const editedArchived = await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: archivedWorkout.id,
      workoutType: "strength_training",
      name: "Deadlift",
      durationMinutes: 30,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(now.getTime() - 2_000),
      movements: [{
        movementName: "Deadlift",
        notes: null,
        sets: [{ reps: 5, load: 135, loadUnit: "lb" }],
      }],
    });
    assert.ok(editedArchived);
    await db.recomputeGoalsForUser({ userId: ada.id });
    assert.equal(
      await scalar(
        client,
        `select count(*)::int
         from community_post_goals as badge
         join goal_periods as period on period.id = badge.goal_period_id
         where period.goal_id = $1`,
        [archivedPosted.id],
      ),
      0,
    );
    assert.notEqual(
      await scalar(client, "select state from goal_periods where goal_id = $1 order by created_at desc limit 1", [archivedPosted.id]),
      "reached",
    );

    const raised = await db.updateGoalForUser({
      userId: ada.id,
      goalId: weekly.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 4,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: "America/Chicago",
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    const oldEnd = await scalar(
      client,
      "select period_end from goal_periods where goal_id = $1 and definition_version = 1 limit 1",
      [weekly.id],
    );
    assert.ok(oldEnd);
    assert.notEqual(raised.progress.target, 1);
    assert.equal(
      await scalar(
        client,
        "select count(*)::int from goal_periods where goal_id = $1 and period_end is null and state = 'pending'",
        [weekly.id],
      ),
      0,
    );

    await assert.rejects(
      () => db.markGoalDoneForUser(ada.id, archivedPosted.id),
      (error) => error.name === "GoalRequestError",
    );
    assert.ok(late.id);
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

test("archived goals stay archived, reopen expiry uses the current version, origin stays frozen, and after-grace edits still recompute", async () => {
  const testUrl = await recreateDatabase();
  process.env.DATABASE_URL = testUrl;
  if (globalThis.repinPool) {
    await globalThis.repinPool.end();
    globalThis.repinPool = undefined;
    globalThis.repinDatabase = undefined;
  }
  const client = new Client({ connectionString: testUrl });
  await client.connect();

  try {
    await prepareDatabase(client);
    await runDrizzleMigrate(testUrl);
    await applySupabaseMigrations(client);
    await createBypassRole(client);

    const { addZonedDays, formatZonedYmd, sundayWeekBounds } = await import("@repin/validation");
    const db = await import("../src/index.ts");
    const zone = "America/Chicago";
    const now = new Date();
    const ada = await db.getOrCreateUser({ id: crypto.randomUUID(), displayName: "Ada" });
    const crew = await db.createGroup({ ownerId: ada.id, name: "Morning Crew" });
    const beta = await db.createGroup({ ownerId: ada.id, name: "Beta Crew" });

    const reachedLift = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 200,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: "Deadlift",
      lane: null,
    });
    const reachedWorkout = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Deadlift",
      name: "Deadlift",
      durationMinutes: 30,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      movements: [{
        movementName: "Deadlift",
        notes: null,
        sets: [{ reps: 1, load: 225, loadUnit: "lb" }],
      }],
    });
    assert.ok(reachedWorkout.goals.reached.some((item) => item.goalId === reachedLift.id));
    await db.archiveGoalForUser(ada.id, reachedLift.id);
    await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "other",
      title: "Unrelated",
      name: "Unrelated",
      durationMinutes: 10,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: new Date(now.getTime() + 1_000),
    });
    const stillArchived = await db.getGoalForUser(ada.id, reachedLift.id);
    assert.equal(stillArchived.state, "archived");
    assert.equal(stillArchived.completionMethod, "auto");

    const pendingWeekly = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 3,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
    });
    await db.archiveGoalForUser(ada.id, pendingWeekly.id);
    await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      title: "Later log",
      name: "Later log",
      durationMinutes: 20,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: new Date(now.getTime() + 2_000),
    });
    assert.equal((await db.getGoalForUser(ada.id, pendingWeekly.id)).state, "archived");
    assert.notEqual(
      await scalar(client, "select state from goal_periods where goal_id = $1 order by created_at desc limit 1", [pendingWeekly.id]),
      "reached",
    );

    const createdAt = addZonedDays(now, -10, zone);
    const dated = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "one_time",
      deadlineAt: formatZonedYmd(addZonedDays(createdAt, 8, zone), zone),
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
      now: createdAt,
    });
    const datedWorkout = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "other",
      title: "One",
      name: "One",
      durationMinutes: 12,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: addZonedDays(createdAt, 1, zone),
    });
    assert.ok(datedWorkout.goals.reached.some((item) => item.goalId === dated.id));
    const reopened = await db.reopenGoalForUser({
      userId: ada.id,
      goalId: dated.id,
      now,
      deadlineAt: formatZonedYmd(addZonedDays(now, 1, zone), zone),
    });
    assert.equal(reopened.state, "active");
    const missed = await db.listGoalsForUser(ada.id, addZonedDays(now, 4, zone));
    assert.equal(missed.history.find((goal) => goal.id === dated.id)?.state, "expired");
    assert.equal(missed.active.some((goal) => goal.id === dated.id), false);
    assert.equal(
      await scalar(
        client,
        "select state from goal_periods where goal_id = $1 and definition_version = 1 order by created_at limit 1",
        [dated.id],
      ),
      "reached",
    );

    const originLift = await db.createGoalForUser({
      userId: ada.id,
      kind: "lift",
      metric: "load",
      sportFilter: null,
      target: 135,
      displayUnit: "lb",
      schedule: "one_time",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: "Bench Press",
      lane: null,
    });
    assert.ok(originLift.id);
    const originWorkout = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "strength_training",
      title: "Bench",
      name: "Bench",
      durationMinutes: 25,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: new Date(),
      movements: [{
        movementName: "Bench Press",
        notes: null,
        sets: [{ reps: 1, load: 185, loadUnit: "lb" }],
      }],
    });
    await db.shareSessionGoalBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: originWorkout.id,
    });
    await client.query(
      "insert into community_posts (user_id, group_id, workout_session_id) values ($1, $2, $3)",
      [ada.id, beta.id, originWorkout.id],
    );
    await db.deleteCommunityPostForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: originWorkout.id,
      deleteWorkout: false,
    });
    await db.recomputeGoalsForUser({ userId: ada.id });
    assert.equal(
      await scalar(client, "select originating_post_id from goal_periods where source_session_id = $1", [originWorkout.id]),
      null,
    );
    await assert.rejects(
      () => db.shareSessionGoalBadges({
        userId: ada.id,
        groupId: beta.id,
        sessionId: originWorkout.id,
      }),
      (error) => error.name === "GoalRequestError" && error.statusCode === 403,
    );

    const twoWeeksStart = addZonedDays(sundayWeekBounds(now, zone).weekStart, -14, zone);
    const twoWeeksMid = addZonedDays(twoWeeksStart, 3, zone);
    const minutes = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "minutes",
      sportFilter: null,
      target: 10,
      displayUnit: "min",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
      now: addZonedDays(twoWeeksStart, 1, zone),
    });
    const shortLog = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "hiit",
      title: "HIIT",
      name: "HIIT",
      durationMinutes: 5,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: twoWeeksMid,
    });
    await client.query(
      "update workout_sessions set created_at = $2 where id = $1",
      [shortLog.id, twoWeeksMid],
    );
    await db.recomputeGoalsForUser({ userId: ada.id, now });
    assert.equal(
      await scalar(client, "select state from goal_periods where goal_id = $1 and period_start = $2", [minutes.id, twoWeeksStart]),
      "pending",
    );
    const edited = await db.updateWorkoutForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: shortLog.id,
      workoutType: "hiit",
      name: "HIIT",
      durationMinutes: 15,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: twoWeeksMid,
    });
    assert.ok(edited);
    await client.query(
      "update workout_sessions set created_at = $2 where id = $1",
      [shortLog.id, twoWeeksMid],
    );
    await db.recomputeGoalsForUser({ userId: ada.id, now });
    assert.equal(
      await scalar(client, "select state from goal_periods where goal_id = $1 and period_start = $2", [minutes.id, twoWeeksStart]),
      "reached",
    );

    const closed = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "minutes",
      sportFilter: "run",
      target: 10,
      displayUnit: "min",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
      now: addZonedDays(twoWeeksStart, 1, zone),
    });
    await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "run",
      title: "Too late",
      name: "Too late",
      durationMinutes: 20,
      effort: 3,
      caption: null,
      photoPath: null,
      occurredAt: twoWeeksMid,
    });
    await db.recomputeGoalsForUser({ userId: ada.id, now });
    assert.equal(
      await scalar(client, "select state from goal_periods where goal_id = $1 and period_start = $2", [closed.id, twoWeeksStart]),
      "pending",
    );

    const futureMinutes = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "minutes",
      sportFilter: "walk",
      target: 10,
      displayUnit: "min",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
    });
    const firstOccurred = new Date();
    const firstFiveMin = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "walk",
      title: "Walk A",
      name: "Walk A",
      durationMinutes: 5,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: firstOccurred,
    });
    const secondOccurred = new Date();
    const secondFiveMin = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "walk",
      title: "Walk B",
      name: "Walk B",
      durationMinutes: 5,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: secondOccurred,
    });
    assert.ok(secondFiveMin.goals.reached.some((item) => item.goalId === futureMinutes.id));
    const futureOccurred = new Date(Date.now() + 120_000);
    const futureSession = await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "walk",
      title: "Walk later",
      name: "Walk later",
      durationMinutes: 5,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: futureOccurred,
    });
    assert.equal(
      futureSession.goals.reached.some((item) => item.goalId === futureMinutes.id),
      false,
    );
    await db.shareSessionGoalBadges({
      userId: ada.id,
      groupId: crew.id,
      sessionId: secondFiveMin.id,
    });
    const archivedFuture = await db.archiveGoalForUser(ada.id, futureMinutes.id);
    assert.equal(archivedFuture.state, "archived");
    assert.ok(archivedFuture.archivedAt);
    const firstCutoff = await scalar(client, "select archived_at from goals where id = $1", [futureMinutes.id]);
    await client.query("select pg_sleep(0.05)");
    await db.archiveGoalForUser(ada.id, futureMinutes.id);
    const secondCutoff = await scalar(client, "select archived_at from goals where id = $1", [futureMinutes.id]);
    assert.equal(new Date(firstCutoff).getTime(), new Date(secondCutoff).getTime());
    assert.equal(archivedFuture.archivedAt, new Date(firstCutoff).toISOString());
    await db.deleteCommunityPostForOwner({
      userId: ada.id,
      groupId: crew.id,
      workoutSessionId: firstFiveMin.id,
      deleteWorkout: true,
    });
    await db.recomputeGoalsForUser({
      userId: ada.id,
      now: new Date(futureOccurred.getTime() + 1_000),
    });
    assert.equal((await db.getGoalForUser(ada.id, futureMinutes.id)).state, "archived");
    assert.notEqual(
      await scalar(
        client,
        "select state from goal_periods where goal_id = $1 order by created_at desc limit 1",
        [futureMinutes.id],
      ),
      "reached",
    );
    assert.equal(
      await scalar(
        client,
        `select count(*)::int
         from community_post_goals as badge
         join goal_periods as period on period.id = badge.goal_period_id
         where period.goal_id = $1`,
        [futureMinutes.id],
      ),
      0,
    );
    await db.createWorkoutForMember({
      userId: ada.id,
      displayName: ada.displayName,
      groupId: crew.id,
      workoutType: "walk",
      title: "Walk after archive",
      name: "Walk after archive",
      durationMinutes: 20,
      effort: 2,
      caption: null,
      photoPath: null,
      occurredAt: new Date(futureOccurred.getTime() + 2_000),
    });
    await db.recomputeGoalsForUser({
      userId: ada.id,
      now: new Date(futureOccurred.getTime() + 3_000),
    });
    assert.notEqual(
      await scalar(
        client,
        "select state from goal_periods where goal_id = $1 order by created_at desc limit 1",
        [futureMinutes.id],
      ),
      "reached",
    );
    assert.equal((await db.getGoalForUser(ada.id, futureMinutes.id)).state, "archived");

    const raceArchive = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
    });
    const [firstArchive, secondArchive] = await Promise.all([
      db.archiveGoalForUser(ada.id, raceArchive.id),
      db.archiveGoalForUser(ada.id, raceArchive.id),
    ]);
    assert.equal(firstArchive.state, "archived");
    assert.equal(secondArchive.state, "archived");
    assert.equal(firstArchive.archivedAt, secondArchive.archivedAt);
    assert.equal(
      await scalar(client, "select count(distinct archived_at)::int from goals where id = $1", [raceArchive.id]),
      1,
    );
    assert.ok(await scalar(client, "select archived_at from goals where id = $1", [raceArchive.id]));

    const raceEdit = await db.createGoalForUser({
      userId: ada.id,
      kind: "volume",
      metric: "workout_count",
      sportFilter: null,
      target: 1,
      displayUnit: "count",
      schedule: "weekly",
      deadlineAt: null,
      timeZone: zone,
      movementId: null,
      movementName: null,
      lane: null,
    });
    const raceEditResult = await Promise.allSettled([
      db.archiveGoalForUser(ada.id, raceEdit.id),
      db.updateGoalForUser({
        userId: ada.id,
        goalId: raceEdit.id,
        kind: "volume",
        metric: "workout_count",
        sportFilter: null,
        target: 3,
        displayUnit: "count",
        schedule: "weekly",
        deadlineAt: null,
        timeZone: zone,
        movementId: null,
        movementName: null,
        lane: null,
      }),
    ]);
    const afterRace = await db.getGoalForUser(ada.id, raceEdit.id);
    const raced = await client.query(
      "select state, archived_at, target_value, active_slot from goals where id = $1",
      [raceEdit.id],
    );
    const racedRow = raced.rows[0];
    assert.equal(racedRow.state === "archived", racedRow.archived_at != null);
    assert.equal(afterRace.state, "archived");
    assert.ok(afterRace.archivedAt);
    assert.equal(racedRow.state, "archived");
    assert.ok(racedRow.archived_at);
    assert.equal(racedRow.active_slot, null);
    assert.ok([1, 3].includes(Number(racedRow.target_value)));
    assert.ok(raceEditResult.some((item) => item.status === "fulfilled"));
    const editOutcome = raceEditResult[1];
    if (editOutcome.status === "rejected") {
      assert.equal(editOutcome.reason.name, "GoalRequestError");
      assert.equal(editOutcome.reason.statusCode, 409);
      assert.equal(Number(racedRow.target_value), 1);
    }
  } finally {
    await client.end();
    if (globalThis.repinPool) {
      await globalThis.repinPool.end();
      globalThis.repinPool = undefined;
      globalThis.repinDatabase = undefined;
    }
  }
});

async function scalar(client, text, params = []) {
  const result = await client.query(text, params);
  const [row] = result.rows;
  return row ? row[Object.keys(row)[0]] : undefined;
}

async function recreateDatabase() {
  const admin = new Client({ connectionString: withDatabase(sourceUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query("drop database if exists repin_goals_test with (force)");
    await admin.query("create database repin_goals_test");
  } finally {
    await admin.end();
  }
  return withDatabase(sourceUrl, "repin_goals_test");
}

function withDatabase(connectionString, database) {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function prepareDatabase(client) {
  await client.query("create extension if not exists pgcrypto");
  await createRole(client, "anon");
  await createRole(client, "authenticated");
  await client.query(`
    create schema if not exists auth;
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
      )::uuid
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await client.query(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text,
      name text,
      owner uuid,
      created_at timestamptz not null default now()
    );
    create or replace function storage.foldername(name text)
    returns text[]
    language sql
    immutable
    as $$
      select case
        when name is null or position('/' in name) = 0 then array[]::text[]
        else (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1]
      end
    $$;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.buckets to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    alter table storage.objects enable row level security;
  `);
}

async function runDrizzleMigrate(databaseUrl) {
  await run(path.join(dbPackageRoot, "node_modules/.bin/drizzle-kit"), ["migrate"], {
    cwd: dbPackageRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function applySupabaseMigrations(client) {
  const directory = path.join(repoRoot, "supabase/migrations");
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(path.join(directory, file), "utf8");
    await client.query(sql);
  }
}

async function createBypassRole(client) {
  const existing = await client.query("select 1 from pg_roles where rolname = 'repin_api'");
  if (existing.rowCount === 0) {
    await client.query("create role repin_api nologin bypassrls");
  }
  await client.query(`
    grant usage on schema public to repin_api;
    grant select, insert, update, delete on all tables in schema public to repin_api;
  `);
}

async function createRole(client, name) {
  const existing = await client.query("select 1 from pg_roles where rolname = $1", [name]);
  if (existing.rowCount === 0) {
    await client.query(`create role ${name} nologin noinherit`);
  }
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
