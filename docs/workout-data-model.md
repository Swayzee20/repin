# RepIn Workout Data Model

This document describes RepIn's current workout-domain architecture, the reasoning behind it, and the intended direction for future workout features.

It should be treated as a living architecture reference and updated as the workout system evolves.

Last major architecture update: August 2026.

---

# 1. Overview

RepIn separates a workout into three primary concepts and one session-owned results layer:

1. **Workout Definition** — what is prescribed or intended to be performed.
2. **Workout Session** — what a user actually did.
3. **Session Results** — structured actual metrics, movements, and sets recorded for that session.
4. **Community Post** — how a completed workout is shared socially.

These concepts intentionally have separate lifecycles.

```text
WORKOUT DEFINITION
"What should I do?"
        │
        │ optional
        ▼
WORKOUT SESSION
"What did I actually do?"
        │
        ├── workout_session_metrics
        └── session_movement_results
                    └── set_results
        │
        │ optional sharing
        ▼
COMMUNITY POST
"What do I want my group to see?"
```

This separation is the foundation for future functionality such as:

- manually created structured workouts
- AI-generated workouts
- AI workout photo extraction
- training programs
- adaptive AI coaching
- workout history
- exercise progression
- personal records
- detailed set/rep tracking
- multiple-group sharing

A workout session does **not** need a workout definition.

A workout session does **not** need a Community post.

A Community post references a workout session rather than acting as the workout itself.

---

# 2. Why the Model Changed

RepIn originally used a single `workouts` table.

One row represented all of the following at the same time:

- completed workout
- workout result
- Community feed item
- group association
- caption
- photo
- workout metadata

This created several architectural limitations.

For example:

- Every workout had to belong to a group.
- Personal workout history could be deleted when a group was deleted.
- One workout could not naturally be shared to multiple groups.
- A private workout could not exist without being posted.
- Prescribed workouts could not exist before completion.
- Planned and actual workout information could not be distinguished.
- Structured exercises, blocks, sets, reps, loads, and intervals had nowhere to live.
- AI-generated workouts and photo extraction could not cleanly produce structured workout data.

The workout system was therefore migrated to separate personal workout history from social sharing and then extended with a structured workout-prescription model.

The legacy `workouts` table remains in the database for historical/audit/rollback purposes but is no longer used by active application reads or writes.

---

# 3. Current High-Level Architecture

```text
                  ┌─────────────────────────┐
                  │   workout_definitions   │
                  │                         │
                  │ Prescribed workout      │
                  └────────────┬────────────┘
                               │
                               │ contains
                               ▼
                  ┌─────────────────────────┐
                  │     workout_blocks      │
                  └────────────┬────────────┘
                               │
                               │ contains
                               ▼
                  ┌─────────────────────────┐
                  │     block_movements     │
                  └────────────┬────────────┘
                               │
                               │ optional canonical link
                               ▼
                  ┌─────────────────────────┐
                  │        movements        │
                  └─────────────────────────┘


workout_definitions
        │
        │ optional reference
        ▼
┌─────────────────────────┐
│    workout_sessions     │
│                         │
│ Personal workout        │
│ history / completion    │
└───────┬───────────┬─────┘
        │           │
        │           ├── workout_session_metrics
        │           └── session_movement_results
        │                       └── set_results
        │
        │ may be shared
        ▼
┌─────────────────────────┐
│    community_posts      │
│                         │
│ Group/social layer      │
└─────────────────────────┘
```

---

# 4. `workout_sessions`

`workout_sessions` is the canonical source of truth for a user's personal workout history.

It represents:

> "This user performed a workout."

It does **not** represent where the workout was shared.

## Current fields

Conceptually:

```text
workout_sessions
----------------
id
user_id
workout_definition_id      nullable
workout_type
name
duration_minutes
effort
occurred_at
notes
created_at
updated_at
```

`workout_definition_id` is nullable.

This is intentional.

RepIn's current quick-log flow can create a valid session without having a structured workout definition.

For example:

```text
Strength Training
45 minutes
Effort: 4/5
```

is still a legitimate workout session even if RepIn does not know every exercise that was performed.

## Ownership

The session owns personal/completion data such as:

- user
- workout type
- workout name
- actual duration
- effort rating
- occurrence time
- private/session notes
- eventual workout results

The session does **not** own:

- group
- Community caption
- Community photo
- publication time

Those belong to `community_posts`.

## Effort

RepIn currently supports an effort value from 1–5.

This field lives on the session because effort describes the user's experience performing the workout rather than the social post.

This may later become an input to adaptive training.

---

# 5. `community_posts`

`community_posts` is RepIn's social sharing layer.

It represents:

> "This workout session was shared to this group."

Conceptually:

```text
community_posts
---------------
id
user_id
group_id
workout_session_id
caption
photo_path
created_at
updated_at
```

A Community post references a workout session.

## Important behavior

A session may theoretically be shared into multiple groups:

```text
Workout Session
      │
      ├── Community Post → Group A
      │
      └── Community Post → Group B
```

The personal workout count remains **one** because personal workout history is based on sessions, not posts.

RepIn prevents duplicate sharing of the same session into the same group using a unique constraint on:

```text
(group_id, workout_session_id)
```

## Ownership

The Community post owns:

- group
- social caption
- social photo
- publication timestamps

Deleting a Community post should not delete the workout session.

Deleting a group may remove the group's posts while the user's personal session survives.

---

# 6. Personal Reads vs. Social Reads

RepIn intentionally uses different data sources depending on the question being answered.

## Personal data

Questions such as:

- Did I work out today?
- How many workouts have I done this week?
- What was my most recent workout?
- What should appear in my personal history?

read from:

```text
workout_sessions
```

They do not depend on Community posts or groups.

## Social/group data

Questions such as:

- What workouts are in this group's feed?
- What caption did someone post?
- What photo did they attach?
- What should appear on the Community tab?

read through:

```text
community_posts
    ↓
workout_sessions
    ↓
users
```

This composed query currently powers:

- Home Activity
- Community
- group detail
- group workout feed APIs

---

# 7. `workout_definitions`

`workout_definitions` represents a workout prescription.

It answers:

> "What is supposed to be performed?"

It is separate from `workout_sessions`, which answers:

> "What did the user actually perform?"

Conceptually:

```text
workout_definitions
-------------------
id
created_by_user_id
title
description
source_type
created_at
updated_at
```

## Current source types

Supported source types are:

```text
manual
ai_generated
photo_import
```

This allows RepIn to know where a workout definition originated without changing how the workout itself is represented.

Examples:

```text
Manual workout builder
       ↓
workout_definition


AI Trainer
       ↓
workout_definition


Photo scanner
       ↓
workout_definition
```

All three eventually produce the same canonical workout structure.

## Definition lifecycle

A definition may exist without ever being completed.

For example, an AI Trainer could create:

```text
Monday — Upper Body A
```

several days before the user performs it.

A definition may also potentially be performed multiple times.

Deleting a definition does not delete historical sessions.

Existing session references are set to null so completed workout history survives.

---

# 8. Workout Blocks

A workout is modeled as an ordered collection of blocks.

This is intentionally more flexible than modeling every workout as:

```text
exercise
sets
reps
```

because many real workouts contain concepts such as:

- rounds
- AMRAPs
- EMOMs
- intervals
- shared work
- partner work
- max-rep sets
- rest blocks
- timed work
- freeform instructions

Conceptually:

```text
workout_blocks
--------------
id
workout_definition_id
position
type
title
rounds
duration_seconds
config
created_at
updated_at
```

## Current block types

```text
straight_sets
rounds
for_time
amrap
emom
interval
work
rest
freeform
```

The list may expand as RepIn supports additional training styles.

## Ordering

Blocks contain a `position`.

Positions must be unique within a definition.

Example:

```text
Workout Definition

position 0
Warm-up

position 1
Strength

position 2
Conditioning

position 3
Cooldown
```

---

# 9. Block Movements

A workout block contains ordered movement entries.

Conceptually:

```text
block_movements
---------------
id
workout_block_id

movement_id             nullable
movement_name
position

target_sets
target_reps_min
target_reps_max
target_seconds
target_distance
target_calories
target_load

rep_type
is_shared
participant
notes
config

created_at
updated_at
```

## Structured targets

Common workout concepts receive first-class fields.

Examples include:

- sets
- rep minimum
- rep maximum
- duration
- distance
- calories
- load
- participant
- shared work

This makes the workout structure queryable and useful for future analytics and AI systems.

---

# 10. Canonical Movements

RepIn has a lightweight `movements` table.

Conceptually:

```text
movements
---------
id
name
slug
category
equipment
created_at
updated_at
```

This represents canonical exercises such as:

```text
Barbell Bench Press
Back Squat
Pull-Up
Toes to Bar
Air Squat
```

The movement library is intentionally not comprehensive yet.

## Canonical + source-name strategy

`block_movements` contains both:

```text
movement_id
movement_name
```

`movement_id` is nullable.

`movement_name` is always preserved.

For example, an AI photo import may read:

```text
BB Bench
```

RepIn could eventually associate this with:

```text
movement_id → Barbell Bench Press
```

while still retaining:

```text
movement_name = "BB Bench"
```

If RepIn does not recognize a movement:

```text
movement_id = null
movement_name = "Some Gym-Specific Movement"
```

The workout remains valid.

Deleting a canonical movement also does not destroy historical workout structure. The canonical reference becomes null while `movement_name` remains.

---

# 11. JSONB Escape Hatch

Both:

```text
workout_blocks.config
block_movements.config
```

support JSONB configuration.

JSONB should **not** contain the entire workout structure.

Common concepts should use structured columns whenever possible.

Use `config` only for unusual or format-specific data that does not yet justify a permanent schema field.

The guiding rule is:

> Preserve structure when RepIn understands something, but preserve flexibility when it does not.

This is particularly important for AI imports because real-world workout formats can vary significantly.

---

# 12. Examples

## Standard strength workout

```text
Upper Body

Block 0 — Straight Sets

Barbell Bench Press
3 sets
8–10 reps
```

Could be represented approximately as:

```text
workout_definition
  Upper Body

workout_block
  type = straight_sets

block_movement
  movement_name = Barbell Bench Press
  target_sets = 3
  target_reps_min = 8
  target_reps_max = 10
```

---

## AMRAP

```text
20-minute AMRAP

5 Pull-Ups
10 Push-Ups
15 Air Squats
```

Representation:

```text
Block
type = amrap
duration_seconds = 1200

Movement 0
Pull-Ups
5 reps

Movement 1
Push-Ups
10 reps

Movement 2
Air Squats
15 reps
```

---

## Partner workout

Example:

```text
75 shared Toes to Bar

5 rounds:

Partner 1:
Max-rep Barbell Bench Press

Partner 2:
Max-rep Barbell Bench Press

75 shared Toes to Bar
```

Representation:

```text
Block 0 — Work
75 Toes to Bar
shared = true

Block 1 — Rounds
rounds = 5

Barbell Bench Press
participant = Partner 1
rep_type = max

Barbell Bench Press
participant = Partner 2
rep_type = max

Block 2 — Work
75 Toes to Bar
shared = true
```

This representative format has already been verified against the current schema.

---

# 13. Prescribed vs. Actual Data

One of the most important architectural rules is:

> Workout definitions contain prescribed targets. Workout sessions/results contain what actually happened.

Example:

Definition:

```text
Bench Press
3 × 8–10
```

Possible completed result:

```text
185 × 10
185 × 9
185 × 8
```

Those do not overwrite each other. Prescribed targets remain associated with the definition, while actual results belong to the completed session through three result tables.

## Workout-level actual metrics

`workout_session_metrics` stores ordered results that describe the workout as a whole:

```text
workout_session_metrics
-----------------------
id
workout_session_id
position
metric_type
label
numeric_value
text_value
unit
created_at
updated_at
```

Supported initial metric types are:

```text
duration
distance
calories
rounds
score
pace
other
```

At least one of `numeric_value` or `text_value` is required. Measurements should use numeric values when practical. For example, a run can store `3.2 mi` and `1694 sec`, while an unusual score can use text such as `5 rounds + 12 reps`.

## Movements actually performed

`session_movement_results` records ordered movements actually performed during a session:

```text
session_movement_results
------------------------
id
workout_session_id
block_movement_id       nullable
movement_id             nullable
movement_name
position
notes
config
created_at
updated_at
```

`block_movement_id` optionally connects an actual result to the corresponding prescribed movement. It is only valid when that prescribed movement belongs to the session's workout definition.

`movement_id` optionally connects the result to the canonical movement library. `movement_name` is always retained, including for unrecognized or manually entered movements.

Deleting a prescribed or canonical movement sets the optional reference to null rather than deleting completed history.

## Actual sets/results

`set_results` stores ordered results under a performed movement:

```text
set_results
-----------
id
session_movement_result_id
position
reps
load
load_unit
duration_seconds
distance
distance_unit
calories
completed
notes
config
created_at
updated_at
```

A result can describe strength work, timed work, distance work, bodyweight repetitions, a skipped/incomplete set, or an unusual format preserved in `config`. Common result values stay in first-class columns rather than JSONB.

Deleting a session cascades to its metrics, movement results, and sets. Deleting a movement result cascades to its sets.

---

# 14. Current Quick Workout Logging

RepIn's Quick Log form transactionally creates:

```text
workout_session
      ├── optional workout_session_metrics
      └── optional session_movement_results
                        └── optional set_results
      ↓
community_post
```

It does not currently create a structured workout definition.

This is intentional.

A user can still log a minimal workout with only a workout type and occurred timestamp. Depending on the selected workout type, Quick Log can also capture precise duration, distance, rounds, a text score, or shorthand strength sets without creating a prescription.

For example:

```text
Strength Training
45 minutes
Effort 3/5
"Good workout today"
```

without being required to enter exercises, sets, reps, or blocks.

Manual workout creation should distinguish between:

### Quick Log

Fast social/accountability check-in.

and potentially:

### Detailed Workout

Detailed workout prescription and/or workout results.

Quick Log and Detailed Workout intentionally converge on the same session/results model. Their difference is UX depth, not database ownership.

Quick Log expands repeated identical-set quantities into individual ordered `set_results` rows before persistence. Canonical movement selection is optional: freeform exercise names are preserved with a null `movement_id`. A minimal Quick Log remains valid with no metric, movement-result, or set-result rows.

---

# 15. AI Workout Generation

Future AI-generated workouts should produce structured workout definitions.

Expected flow:

```text
User preferences/goals
        ↓
AI Trainer
        ↓
Structured workout proposal
        ↓
Validation
        ↓
workout_definition
        ↓
workout_blocks
        ↓
block_movements
```

The AI output should be validated before becoming canonical database data.

The mobile UI should render the structured definition rather than simply displaying arbitrary AI-generated prose.

Examples of future AI inputs may include:

- training goal
- experience level
- available equipment
- available workout duration
- training days per week
- preferred training style
- previous sessions
- previous performance
- effort ratings

---

# 16. AI Photo Workout Import

Future photo import should not directly create trusted workout data.

Expected architecture:

```text
Photo
  ↓
AI vision extraction
  ↓
Workout import proposal
  ↓
User reviews/edits
  ↓
Accepted structured workout
  ↓
workout_definition
```

A photo-import draft layer should retain:

- source image
- raw AI extraction
- confidence values
- parsing status
- errors

Confidence belongs to the import proposal, not the canonical workout definition.

Once the user confirms the extraction, the resulting workout becomes ordinary structured RepIn workout data.

---

# 17. Adaptive AI Trainer

The long-term adaptive trainer should consume structured RepIn data rather than relying primarily on Community captions.

Potential inputs include:

```text
Workout Definitions
        +
Workout Sessions
        +
Actual Exercise Results
        +
Effort Ratings
        +
Training History
        +
User Goals
        ↓
Adaptive Trainer
        ↓
Next Workout Definition
```

For example:

```text
Previous prescription:
Bench Press 185 lb × 8–10

Actual:
185 × 10
185 × 10
185 × 9

Effort:
3/5
```

may eventually allow RepIn to prescribe:

```text
190 lb × 8–10
```

Future progression logic should be carefully designed rather than giving the language model unrestricted control over training decisions.

---

# 18. Current Legacy `workouts` Table

The original `workouts` table still exists in the database.

It contains historical records from before the architecture migration.

It is currently:

- not used for writes
- not used for personal reads
- not used for Community reads

It remains temporarily for:

- rollback
- audit
- migration verification

Do not build new features against the legacy table.

New workout functionality should use:

```text
workout_sessions
community_posts
workout_definitions
workout_blocks
block_movements
movements
workout_session_metrics
session_movement_results
set_results
```

The legacy table may be removed in a future migration after the new architecture has remained stable for an appropriate period.

---

# 19. Key Architectural Rules

When extending RepIn's workout system, preserve these boundaries:

1. **A definition is not a completed workout.**
2. **A session is not a Community post.**
3. **A Community post does not own personal workout history.**
4. **Groups should not own workout sessions.**
5. **Deleting social content should not destroy personal workout history.**
6. **A session may exist without a definition.**
7. **A session may exist without being shared.**
8. **A definition may exist without being completed.**
9. **Prescribed targets and actual results must remain separate.**
10. **AI output must be validated before becoming canonical workout data.**
11. **AI photo extraction should be reviewed before being accepted.**
12. **Unknown movements should not make a workout invalid.**
13. **Canonical movement references should enhance source data, not replace it.**
14. **Common workout concepts should use structured fields.**
15. **JSONB is an escape hatch, not the primary workout schema.**
16. **Quick workout logging should remain possible without detailed structured entry.**
17. **Quick Log and Detailed Workout use the same session/results architecture.**

---

# 20. Current Source of Truth

As of this architecture version:

```text
Personal workout history
    → workout_sessions

Social/group workout activity
    → community_posts + workout_sessions + users

Prescribed workout structure
    → workout_definitions
       + workout_blocks
       + block_movements

Canonical exercise information
    → movements

Structured actual workout results
    → workout_session_metrics
       + session_movement_results
       + set_results

Legacy historical workout model
    → workouts
      (retired from active application behavior)
```

Any future workout-related feature should first determine which of these concepts it actually belongs to before adding fields or tables.
