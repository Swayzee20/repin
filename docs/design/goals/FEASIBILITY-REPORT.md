# Goals — read-only feasibility report

Repository: `Swayzee20/repin`, main at **`0e30ef6dd3cd20652fcd2b46cc2b850b02be97f3`**.
Reviewed November 10, 2026, approximately 9:58 AM CT.

This study used a shallow local clone and source inspection only. No branches, PRs, issues, comments, pushes, migrations, live DB/Supabase access, Apple or EAS actions. This report is the only added file. Proposed tables and behavior below are recommendations, not existing functionality or approved scope.

## Executive conclusion

**Feasible, with important coverage decisions before build approval.**

- Workout-count goals work across all current types, including Quick Log. Recorded-distance goals work for run/walk/cycling; interval-only workouts need a defined fallback.
- Performance goals can reuse existing PR identities: five distance lanes for run/walk/cycling, and positive **one-rep** lifts in Strength Training/Powerlifting. Arbitrary distances, multi-rep maxes and FF benchmark-time goals are not already covered by those two PR kinds.
- **True active minutes across all types cannot currently be computed reliably.** Current Quick Log has no duration; Detailed strength has no duration; other durations can be absent or represent elapsed format windows/rests.
- **Total weight lifted across all types is not currently reliable.** Actual strength sets support external load × reps when both exist. Functional Fitness saves per-round/interval/workout quantities, not expanded actual completed volume. Body mass, assistance and per-hand/combined-load semantics are missing.
- `personal_records` is a mutable current-best cache, not an event log. Watching only `pr.detected` misses first distance bests, quiet baselines, ties, and qualifying performances below an old lifetime PB. This needs a product decision, not an implicit behavior change.
- Recommend owner-private **`goals` + `goal_periods`**, with explicit completion evidence, and a sibling **`community_post_goals`** shared-badge table. Reuse UI patterns, not PR table semantics.
- **10–15 dev-days** for a recorded-data version with explicitly approved limits; **14–22 dev-days** if reliable cross-type active time and FF-inclusive actual lifting volume require new collection/derivation. Studio mocks and Josue's scope approval come before implementation.

## 1. Existing data and supported goals

### Sources and actual logging behavior

Canonical personal history is `workout_sessions`; actual results are `workout_session_metrics`, `workout_session_segments`, `session_movement_results` → `set_results`. Definitions/blocks/targets describe prescriptions, not actual results. `community_posts` is separate social sharing. Do not count posts or aggregate legacy `workouts`. Sources: `packages/db/src/schema.ts:355–745`; `docs/workout-data-model.md:769–1003,1130–1163`.

The architecture migration copied legacy workouts to sessions, including nullable `duration_minutes`, so minute-only historical sessions can exist without metrics (`packages/db/drizzle/0008_freezing_squadron_supreme.sql:34–80`). Never count both copies.

Eight types are `run`, `walk`, `cycling`, `strength_training`, `powerlifting`, `hiit`, `functional_fitness`, `other`. Run subtypes: distance/tempo/interval. FF formats: AMRAP/For Time/EMOM/Rounds (`packages/types/src/index.ts:120–151`; `packages/db/src/schema.ts:48–51`).

**Current Quick Log is a minimal check-in**, sending `durationMinutes: null`, `metrics: []`, `movements: []`, with type/date/effort/caption/photo (`apps/mobile/app/groups/[id]/log-workout.tsx:169–183`). It can count as a workout, but currently contributes no distance, minutes, lifting volume or performance PR. Richer helper functions/old documentation are not proof of current Quick Log fields.

Detailed Workout sends actual strength sets, FF movement quantities + format/score, or cardio metrics. Its interval-run branch explicitly submits **no overall metrics and no overall duration**, only expanded segment rows (`apps/mobile/app/groups/[id]/detailed-workout.tsx:303–343`).

Storage permits sessions without posts, but current logging uses the crew-scoped creation API, checking active membership/open group, then creating session + post + detecting PRs transactionally (`apps/api/app/api/groups/[id]/workouts/route.ts:65–123`; `packages/db/src/index.ts:1090–1215`). A lower-level `createWorkoutSessionWithResults` can create results without post or PR detection (`index.ts:522–528`); future callers must participate in goal evaluation too. There is not an existing general private-workout/share-later UI.

### Metric support matrix

| Metric/kind | What can be supported now | Boundary |
|---|---|---|
| Workout count | Count owned session ids by `occurred_at`, all eight types | One session once, irrespective of crews/posts. Minimal check-in counts if approved; recommend yes. |
| Volume distance | Numeric session distance in m/km/mi, principally run/walk/cycling | Prefer session total. If approved, otherwise sum known work-segment distances once. Missing distance remains unknown. Never total + segments. Exclude FF template/set-distance expansion from v1. |
| Active minutes | Only an explicitly limited “logged elapsed workout minutes” measure | Not complete or true active time across types. Requires a renamed/approved definition or new collection. |
| Total weight lifted | Recorded external-load volume from eligible strength/powerlifting sets | Requires reps + load + recognized unit + completed set. Not all workouts, body mass or FF template volume. |
| Time performance | Existing distance-time lanes in run/walk/cycling | Requires session-level total distance and duration; not interval-only results or arbitrary distances. |
| Lift performance | Existing heaviest-single movement identities | Exactly one rep, positive lb/kg load; only strength_training/powerlifting. No estimated 1RM, multi-rep max or FF lift PR. |

`getUserWorkoutSnapshot` already counts personal sessions independent of posts/groups (`packages/db/src/index.ts:2521–2588`). Sessions have no planned/draft/completed status field; they represent performed workouts. Exclude future occurrence timestamps from progress/reach, even if requests allow them.

### Minutes: why summing `duration_minutes` is not sufficient

1. Request validation requires numeric duration metrics to use seconds. Run/walk/cycling/HIIT/Other permit them; historical unformatted FF can too. Strength/Powerlifting permit **no session metrics** in the current create schema. Metrics can be absent (`packages/validation/src/index.ts:171–208,292–325,398–451`).
2. Session `duration_minutes` is a summary: ordinary duration seconds round to nearest minute, minimum one; FF uses **ceiling**. Summing it introduces per-session rounding (`packages/validation/src/index.ts:428–450`; `packages/validation/src/workout-format.ts:255–280`).
3. Exact FF fields: AMRAP/EMOM `format_duration_seconds`; finished For Time `score_time_seconds`; capped For Time `time_cap_seconds` only if explicitly capped; Rounds optional `score_time_seconds`. Missing score/length is not zero. Format windows/caps are elapsed time, not active-only time.
4. Interval work/recovery seconds are independent optional values. Repeats expand to separate segments, but no overall duration is derived (`apps/mobile/lib/detailed-run-results.ts:105–117`). Known work seconds can be summed, but they are not necessarily a complete workout duration; recovery is a separate semantic choice.
5. If **logged elapsed minutes** is approved: choose one value per session—valid exact total-duration metric, else applicable exact FF result/length, else positive legacy `duration_minutes × 60`. Sum seconds, convert for display once. Interval-only sessions without explicit total remain excluded/unknown. Show coverage/missing-data help; do not call missing values measured zero. If **active minutes** must remain the promise, add explicit actual-active-seconds collection and define historical gaps; current data cannot supply it faithfully.

### Lifting volume: safe subset and gaps

For approved strength/powerlifting scope:

`sum(reps × external_load_kg)` for owned eligible sets with `completed = true`, positive reps, recognized lb/kg unit, and known nonnegative load.

- Identical-set `count` is expanded before storage; do not multiply again (`packages/validation/src/index.ts:215–269`). Detailed strength saves one row per filled set, permitting reps-only or load-only rows (`apps/mobile/ui/strength-form-state.ts:553–594`). Both are needed for tonnage.
- `LB_TO_KG = 0.45359237`; PR load conversion rounds kg to 0.001 (`packages/db/src/pr-detection.ts:3,107–119`). Define canonical precision for targets and accumulation; use decimal arithmetic/high precision and a documented final rounding boundary for volume. Do not compare display-rounded pounds or assume unknown units are kg.
- User/result schemas have no body mass, assisted-load mode, per-hand vs combined-weight field, unilateral rep multiplier, or bodyweight/external-load flag (`packages/db/src/schema.ts:62–70,606–703`). Catalog equipment such as “Bodyweight” is descriptive, not an athlete-weight measurement (`packages/db/seed/starter-movements.sql`). Reps-only bodyweight sets cannot become body mass × reps. Explicit zero external load contributes zero; missing load is unknown/excluded. Weighted bodyweight movements can count only entered external load.
- FF `buildFfMovements` saves **one quantity set per movement**, while headings say “Each round” / “Each interval” (`apps/mobile/ui/functional-format-state.ts:112–115,563–600`). AMRAP completed rounds/partial reps, Rounds multipliers, capped For Time partial work, and rotating/partial EMOM intervals require format-specific actual-work derivation. Naive weight × reps undercounts; multiplying all FF rows by rounds also miscounts partial/capped work. Exclude FF from initial volume, or separately scope actual-completion collection/expansion and tests.

### Exact performance keys to reuse

Source of truth: **`packages/db/src/pr-detection.ts`**, not picker UI keys or movement slugs.

**Lift**: kind `heaviest_single`, key:

- `hs:id:<movement catalog UUID>` when movementId exists;
- otherwise `hs:name:<trimmed, whitespace-collapsed, lowercase movement name>`, e.g. `hs:name:deadlift`.

Use `movementIdentity`/`normalizeMovementName` (lines 98–105) and the same movement selector. Canonical UUID is not a session-movement id. Canonical vs freeform are intentionally separate, and Deadlift/Sumo/Romanian variants are not interchangeable. Extractor requires Strength Training/Powerlifting, `reps === 1`, load > 0, unit lb/kg; greater canonical kg wins, tie is not PR (lines 323–359,163–180).

**Time**: kind `distance_time`, key `dt:<workoutType>:<lane>`, e.g. **`dt:run:5k`**. Sports only `run`, `walk`, `cycling`.

| Lane | Metres |
|---|---:|
| `1mi` | 1609.344 |
| `5k` | 5000 |
| `10k` | 10000 |
| `half` | 21097.5 |
| `marathon` | 42195 |

Convert km × 1000, mi × 1609.344; nearest eligible lane within **0.5% relative error** (`DISTANCE_SNAP_EPSILON = 0.005`). Positive session-level numeric distance + duration are required; duration is rounded to integer seconds. Run subtype and segments are not part of key/extraction. A supplied-total interval run could qualify, but the current interval UI supplies none. See lines 6–20,125–141,361–399.

“5K **under** 20:00” means `< 1200` seconds; “20:00 or faster” means `<= 1200`. A longer run does not imply a timed embedded 5K. Keep the existing snapping behavior exactly rather than inventing a wider match.

Other current PR kinds are AMRAP `amrap:<stable JSON fingerprint>` and For Time `ft:<stable JSON fingerprint>`; they include ordered movement identities/first-set quantities/loads, with AMRAP duration included. They are not workout-name keys and are outside distance-time/lift v1 (`pr-detection.ts:225–247,401–455`). FF benchmark time goals need separate approval.

**Existing caveat:** `PrSessionSet.completed` exists but `extractHeaviestSingles` does **not** test it (`pr-detection.ts:26–37,323–359`). Current API set validation does not accept completed input and ordinary logs default true, but lower-level callers can write false (`packages/db/src/index.ts:307–319,494–513`). Future Goals must not count incomplete sets silently; reconciling this with exact PR reuse is an integration issue to review, not a fix performed here.

## 2. Storage, computation, API, migrations and RLS

### Recommended tables

**A. `goals` (always owner-private)**

- `id`, `user_id` FK users CASCADE; title; kind volume/time/lift; metric; optional sport filter.
- Positive canonical target + dimensional unit (count/metres/seconds/kg/kg-reps), display unit, comparison operator. Time/lift store exact `pr_kind` + `pr_key` and selector/label metadata, without substituting a slug/name for a catalog identity.
- Schedule one_time/weekly/monthly; `starts_at`; optional end-exclusive deadline (required for one-time volume); IANA `time_zone`; chosen week-start policy; definition version; created/updated timestamps.
- Series state active/reached/expired/archived/needs_review; nullable `active_slot`. Repeating series remains active while its current period is reached.
- CHECK positive targets, valid dates and allowed kind/metric/unit/schedule combinations; prohibit time/lift recurrence in v1; index `(user_id,state)`.

**B. `goal_periods` (owner-private progress/completion ledger)**

- `id`, `goal_id`, `user_id`; definition/target version snapshot; `period_start`, `period_end` (nullable for undated performance goal), timezone snapshot. One-time goals also have one period. Non-null start/key, UNIQUE `(goal_id,period_start)`.
- Pending/reached/invalidated state; `reached_at` achievement instant and `recorded_at`; completion method auto/manual; nullable source session/set ids; evidence value/snapshot; invalidation reason; celebration-delivered marker.
- Optional cached progress/computed time, not the authority. Preserve evidence before replacement/cascade; a mutable PR row alone is not sufficient.
- Composite ownership FKs, e.g. `(goal_id,user_id)`, prevent cross-owner attachment; account deletion cascades. Evidence refs may SET NULL, with explicit reconciliation/invalidation rather than leaving null-source auto-completion verified.

**C. `community_post_goals` (explicitly shared badge snapshot)**

- `id`, `post_id` CASCADE, `user_id`, period/completion id, minimal kind/short label/target/result/reached-date snapshot, optional source session id, created timestamp. Do not copy private notes or full progress.
- UNIQUE `(post_id,goal_period_id)` for idempotency; indexes post/completion/user. Share checks owner, valid completion, selected post/session consistency and visibility. If only one post per completion is approved, add UNIQUE completion id; multi-crew sharing requires an explicit choice.
- **Use a sibling, not `community_post_prs`.** Existing PR table only accepts four PR kinds and is unique on `(user_id,kind,key)` and `(post_id,kind,key)`, implementing replaceable active best badges (`packages/db/src/schema.ts:812–934`; `packages/db/drizzle/0018_first_ultron.sql:1–56`). Goals are target/period achievements; multiple goals can use the same movement key and repeat weekly. Do not hijack PR replacement/removal semantics.
- Reuse chip/overflow/layout/undo patterns with distinct Goal copy and accessibility labels. Existing renderer literally says “PR” and shows two then +N (`apps/mobile/ui/pr-badges.tsx:9–46`), used by feed/detail (`apps/mobile/ui/components.tsx:374–377`; `apps/mobile/ui/workout-detail.tsx:951`). Combined or separate overflow rows needs Studio approval.

### Progress and reach computation

**Hybrid:** derive progress from canonical results on read; materialize **completion evidence/state** on writes. With at most five active goals, indexed batched aggregates are preferable initially to fragile increment-only counters. Aggregate each dimension per session before combining, avoiding metric × set join fan-out. Existing owner/date/result-parent indexes: `packages/db/src/schema.ts:389–396,523–530,575–581,631–641,675–682`. Benchmark real history; no production performance claim is made.

- Evaluate in the **same transaction** as create/update/delete, beside PR calls (`packages/db/src/index.ts:1186–1191,1257,1365–1371,1404–1441`). Preserve old occurrence/dimensions/period refs before replacing rows. PR previous keys alone cannot identify both volume periods when an occurrence date moves.
- Use owner + eligible half-open occurrence window, excluding future timestamps. A cumulative target records the chronologically first threshold-crossing session as optional badge context, with one completion per period.
- Lazy period rollover needs no scheduled job: GET can derive current bounds/progress without writes; explicit mutations/reconciliation persist periods/completions and settle expiration. Expired slots are closed transactionally before create/reactivate. Proactive notifications/background celebrations would be additional scope, not existing code.
- Include goal results in log/update responses even if `pr.detected` is empty. Current mobile enters PR overlay only for prompts/detected items (`apps/mobile/app/groups/[id]/detailed-workout.tsx:365–369`; `apps/mobile/ui/pr-flow.tsx:43–44`). Coalesce goal + PR celebrations and preserve one-presenter-at-a-time `onHidden` sequencing from #56 (`pr-flow.tsx:46–51,95–103,127–132,185–190`; `apps/mobile/ui/pr-flow-state.ts`).

### Critical product distinction: PR event versus eligible performance

`personal_records` is UNIQUE user/kind/key and overwritten, not append-only. First singles/For Time prompt; first distance result is a quiet baseline; strict improvements are detected; ties do nothing. “Not a PR” still writes a quiet baseline. Backfill is lazy per missing key, scanning other session history; it never celebrates/badges and has no one-time job. Sources: `packages/db/src/pr-detection.ts:274–298`; `packages/db/src/personal-records.ts:3–7,115–157,334–431,533–649,695–751`.

**Literal PR-only implementation:** evaluate newly logged qualifying bests after detection and prompt resolution; validate exact kind/key, source ownership and goal dates; exclude backfill. Decide whether quiet first bests/declined prompts qualify. Watching only `detected` misses first distance bests. A goal of 300 lb created after an old 350 lb PB will not auto-complete on a later 325 lb lift if only new lifetime PRs qualify.

**Recommended usability behavior, requiring scope approval:** reuse PR candidate extraction/keys, but evaluate any eligible qualifying performance, independently of lifetime improvement. Then first 19:59 5K or a new 325 lb single can reach its target despite quiet baseline/older better PB. Keep PR prompts/badge rules unchanged and explicitly decide how “Not a PR” affects a separate goal. Do not silently broaden Josue's PR-only requirement.

Whichever policy is chosen, retain completion evidence outside PR rows. Current-best recompute alone is insufficient for deadline-scoped goals: lifetime best may lie after the deadline while an older qualifying result lies inside it. Use eligible session history for goal revalidation, not PR mutation timestamps.

### Enforcing max five active goals

An API count-then-insert races; a normal row CHECK cannot count other rows.

Recommend **database-enforced slots**: active_slot integer 1–5, CHECK active series has a slot/inactive series has null, partial UNIQUE `(user_id,active_slot)` where non-null. API serializes per owner (e.g. locks application user row FOR UPDATE), settles expired rows, allocates a slot and returns 409 if full. The unique/check constraints prevent a sixth active row even if prechecks race. Owner immutable. One-time completion releases a slot; recurring-period completion does not. A locked, serialized count trigger is an alternative; an unlocked count trigger is not sufficient. Invalidation/reopen must never implicitly create six active goals.

### API/migration outline — not executed

- Owner endpoints such as `/api/goals`, `/api/goals/[id]`, `/complete`, `/reopen`, plus explicit share/remove/restore badge mutations. Authenticate with `requireApplicationUser`; derive owner from server identity, never client-supplied user id. Validate targets/units/operators/date/zone/source ownership; return no-store.
- New Drizzle tables/checks/indexes/slot constraints in a reviewed migration **after current 0018**, then separate Supabase RLS migration after `20261109000000_personal_records.sql`. Do not edit historical migrations. Update generated metadata/journal during approved implementation only.
- Create privacy permissions atomically or revoke access before exposure. Verify grants/policies before enabling feature. No inferred timezone backfill or historical achievement/celebration flood; any production backfill needs separate approval.
- Review account lifecycle alongside owner cascades (`packages/db/src/index.ts:1577–1580` has explicit legacy/session cleanup).

### RLS and API authorization

Mirror #55, without publicizing Profile goals:

1. ENABLE and **FORCE** RLS on all new tables. Revoke all from PUBLIC/anon/authenticated; grant authenticated **SELECT only**, no INSERT/UPDATE/DELETE grants or write policies. Server API writes use existing DATABASE_URL role; never disable RLS.
2. Goals/periods: owner-only SELECT `user_id = auth.uid()`. Sharing one badge does not expose parent goal, private notes, other periods or progress.
3. Badge SELECT: owner, or `private.can_access_community_post(post_id)` + nonremoved post + `NOT private.is_blocked_between(auth.uid(),user_id)`. Existing helpers enforce current membership and author leave/rejoin watermark; block helper sees both directions under forced RLS. Sources: `supabase/migrations/20261109000000_personal_records.sql:44–121`; `supabase/migrations/20261106000000_crew_page.sql:22–98`.
4. New necessary helpers: narrowly scoped STABLE SECURITY DEFINER, empty search_path, qualified tables, PUBLIC/anon EXECUTE revoked, authenticated EXECUTE only where required. Do not force crew readers to join owner-private goal rows; use minimal shared snapshots.
5. API bypasses RLS, so also enforce owner and post visibility there (`supabase/migrations/20261109000000_personal_records.sql:4–15`; `packages/db/src/connection.ts`). Mirror active membership/open-group rules, author visibility, moderation/removal, bidirectional blocking and report filtering. Only enrich already-authorized post ids like current badge loading (`packages/db/src/index.ts:1632–1715,1918–1924,2215`; `packages/db/src/personal-records.ts:257–272`). Bare id lookup must not bypass this.
6. Extend isolated security tests for owner/stranger/member/leaver/rejoiner, both block directions, removed/reported posts, anon, forged writes and helper privileges. Existing PR pattern: `packages/db/test/security.test.mjs:1818–1969`.

## 3. Edge cases and recommended handling

Recommendations below need approval where they set product semantics.

| Case | Recommendation |
|---|---|
| Hand-marked done, no workout/post | Save manual completion with null source; show reached privately and “No workout post to badge.” Do not fabricate a workout or badge an unrelated post. Optional owner-selected manual link needs explicit confirmation/copy. Standalone goal announcements need a new post model: `community_posts.workout_session_id` is NOT NULL (`schema.ts:705–744`). |
| Workout logged before goal existed | Default prospective, no retroactive auto-celebration. Require occurrence in goal window and, if strictly newly logged only, session creation at/after goal creation. Show existing PB as context; historical credit should be an explicit “use past achievement”/manual choice. Lazy PR backfill is not a new achievement. Define late-entry lookback separately. |
| Recurring boundaries/timezone | Store IANA zone per goal/period; recommend Monday local 00:00 → next Monday exclusive; month first → next month first, not 30 days. Calculate calendar bounds in that zone then store instants; DST is not always 7×24 hours. Freeze goal zone while active so travel does not shift history. Default partial first period counts from creation unless full-period credit approved. Date deadline = next local midnight exclusive. |
| Existing timezone data | **No persisted user/session IANA timezone found.** Users only id/display/terms/created; sessions timestamptz occurrence. Profile/Home send current device `getTimezoneOffset()`, not zone or historical DST. Home/Profile week starts **Sunday**, crew helper **Monday**—existing inconsistency, not a Goals policy. See `schema.ts:62–70,355–388`; `apps/mobile/app/(tabs)/profile/index.tsx:73`; `apps/api/app/api/home/route.ts:177–194`; `packages/validation/src/crew.ts:27–48`. Capture/validate a zone; do not infer from stored timestamp. |
| Edit/delete reaching workout | Extend existing same-transaction PR recompute; preserve prior dates/keys/evidence. Recompute both old/new periods on date shift; replacement sets get new ids. If another eligible result meets target, retain verified completion with recomputed evidence, without automatically moving/sharing badge. Correct or withdraw stale result snapshots. Otherwise invalidate auto completion/remove dependent badges, but keep manual completion unless undone. If five slots now full, use needs-review/reactivation, not sixth active. Existing flow: `index.ts:1257–1371,1404–1441`; `personal-records.ts:59–100,433–531`. |
| Delete/remove post only | Session-based progress and private completion remain. Hard post delete cascades badge; moderation/leave/block affects sharing visibility, not personal progress. Do not choose another post automatically. Existing API distinguishes scope=post vs scope=workout (`apps/api/app/api/groups/[id]/workouts/[sessionId]/route.ts:158–177`). |
| Heavier/faster result | Threshold, not equality: 315 lb single reaches 300 lb; 19:30 reaches under 20:00. Normalize units. Multi-rep 315 does not qualify for heaviest_single. Exact 20:00 only qualifies for “or faster,” not “under.” |
| First best/tie/Not a PR | Make PR-event versus eligible-candidate decision explicitly. Quiet first distance best/ties have no detected event. Declining a PR prompt stores baseline, not deletion. Goal reach must not depend on PR badge sharing/removal/Undo. |
| Deadline/late/future logs | Use source occurrence time, not PR row created/updated or request time. Decide grace for late logs whose achievement was in-window; recommend permit with defined closeout policy. Never count future achievements or workouts occurring after deadline. Revalidation must scan eligible history rather than lifetime best only. |
| Unit conversions/missing data | Canonical kg/metres/seconds, display unit separate. No display-rounding comparisons. Keep PR distance 0.5% snap. Unknown units/missing components excluded with coverage explanation, not guessed. Bodyweight is not inferred load. |
| Repeats/retries/multiple crews/goals | One session contribution regardless of posts; one completion per goal-period; idempotent share by completion+post. Same workout can reach several goals. Never replace another goal's/PR's badge just because key matches. Prevent duplicate celebrations. Existing workout creation generates new UUIDs on every request (`index.ts:1129–1131`), so duplicate workout-request retries need a deliberate idempotency policy. |
| Delete/archive | Recommend archive stops future tracking/releases slot but retains achieved history/badges. Explicit deletion removes goal/period/badges, not workouts/posts, with clear confirmation. Account deletion cascades owned feature data. |
| Reopen/target edit | Explicit reopen checks slots, revokes completion badges, and resets eligibility/start or requires changed target to avoid instantly re-reaching on same evidence. Achieved-period target/key/timezone immutable; edits version future periods rather than rewriting history. |
| Share later/private session | Parent goal stays private. Share chooses an owned valid post/evidence. Current PR share only attaches to an existing post and returns nothing without one (`personal-records.ts:159–215,651–675`); a general private-workout-to-crew publishing flow is added scope. |

## 4. Estimate and verification

Developer-days, one engineer, **after approved scope and Studio mocks**. Excludes approval/review waits, TestFlight processing and live migration application by Josue.

| Workstream | Days |
|---|---:|
| DB/schema, reviewed migrations, period/slot constraints, RLS | 2–3 |
| API/domain progress/reach/recompute, manual/reopen/share, date/zone logic, contracts | 3–4 |
| Mobile Profile/list/detail/create/edit, units/schedules, progress/errors, celebrations/badges | 3–5 |
| Automated tests, isolated DB/security verification, device regression fixes | 2–3 |
| **Recorded-data version total** | **10–15** |

Assumes existing PR lanes/one-rep semantics; approved recorded-distance fallback; minutes explicitly defined as recorded elapsed totals with unknowns excluded; volume limited to known strength/powerlifting external-load sets, FF excluded; no new standalone announcement/private-workout posting system, notifications or arbitrary benchmark kinds. These limitations require approval, not silent substitution for the brief.

Reliable all-type **active** minutes and FF-inclusive **actual** weight volume: add approximately **4–7 dev-days** for agreed actual-work fields/inputs/derivation and tests: **14–22 total**. Better collection cannot reconstruct historical missing data. Arbitrary benchmarks/general private-workout sharing need separate estimates.

### Implementation acceptance plan

- Tests: dimensions/conversions/rounding; snap boundaries; missing duration/load/reps; bodyweight/assistance; expanded sets; FF template exclusion or actual expansion; interval/session no double count; first baselines/ties/declined prompt; goal windows vs lifetime PB; five-slot races/reopen; month/leap/DST/travel/rollover; backdated/future logs; edit/delete/date shifts; source-post ownership and no-post manual completion; sharing/idempotency/Undo; RLS/API visibility matrix; account cascades.
- Extend `packages/db/test/pr-detection.test.ts`, `packages/db/test/personal-records.test.mjs`, `packages/db/test/security.test.mjs` and goal-specific validation/mobile suites.
- **iPhone Duo/TestFlight checklist:** Profile/forms folded, unfolded, Split View; safe strip/nav placement and top-left X; locked (+)/chooser/header unchanged; goal+PR combined celebration with no modal-over-modal regression; two/+N behavior and VoiceOver; remove/Undo toast inside content pane above nav; keyboard/fold/rotation; full slots/retry/errors; manual/no-post; period refresh on foreground. Use `AGENTS.md`, `docs/DESIGN-LANGUAGE.md`, `apps/mobile/ui/layout.tsx`, `overlay-state.ts`, `pr-undo-toast.tsx`. Preserve mobile identifiers/scheme/EAS project id. No device/TestFlight test performed here; future implementation needs a new build and Josue's QA.

### Verification actually performed

- Inspected exact main revision above: schema/migrations, actual logging payloads, validation, PR keys/extraction/persistence/backfill/recompute, sharing/rendering and timezone paths.
- Ran only database-free tests with DATABASE_URL removed:
  `env -u DATABASE_URL node --experimental-strip-types --import ./packages/db/test/register.mjs --test ./packages/db/test/pr-detection.test.ts`
- **14/14 passed.** No dependency install or database connection. DB integration/security suites were read, not run: they recreate test DBs/apply migrations (`packages/db/test/personal-records.test.mjs:383–465`), deliberately outside this read-only study.
- Goals do not exist yet, so proposed behavior is not implemented/tested. Production data completeness, installed grants and live behavior were not queried or asserted.

## 5. Decisions for Josue before scope/mocks/build approval

1. **Minutes:** recorded elapsed minutes with gaps, or true active-only requiring new collection? Keep Quick Log minimal or add optional goal-aware duration/results?
2. **Weight:** known strength/powerlifting external-load sets only for v1, or FF actual work now? Define per-hand/combined loads, bodyweight/assistance and warmup policy.
3. **Auto reach:** new PR/best events only, or any eligible performance using PR keys? Decide first quiet bests, ties, below-lifetime-PB results and “Not a PR.”
4. **Performance selection:** five lanes × run/walk/cycling and one-rep strength/powerlifting only? Time strictly “under” or “or faster”? Arbitrary distances/FF benchmarks are added scope.
5. **Volume filters:** all sports combined or sport-specific? Count minimal Quick Log once? Include known interval work distances without overall totals?
6. **Credit/deadlines:** prospective from creation or current-period/history credit? Existing PB context-only or explicitly confirm immediate completion? Late logging allowed with what grace?
7. **Calendar:** Monday calendar weeks/months, fixed goal IANA zone? Partial first period? Align Profile's Sunday week only with separately approved scope?
8. **Manual sharing:** no post = private reached/no badge, explicit manual link, or new standalone announcement type? One post/crew per completion or explicit multi-crew sharing?
9. **Lifecycle:** repeating series occupies a slot after period reach; one-time reached/expired releases? Evidence invalidation needs-review if slots full? Reopen resets eligibility?
10. **Retention/mocks:** archive retains badges, delete removes them? Combined goal+PR two/+N row or separate rows, and exact Profile placement/detail screens for Studio?

Next step: Friday takes the coverage/semantics decisions and estimate to Josue, then obtains approved Studio mocks. **Do not implement or apply migrations until that approval.**


## 6. Revised plan (Nov 10)

**Inputs:** Josue's decisions relayed November 10 at 10:17 AM CT. This section supersedes conflicting recommendations/estimates in sections 1–5; it does not grant implementation or migration approval. Sources remain the inspected main revision `0e30ef6dd3cd20652fcd2b46cc2b850b02be97f3`; no remote refresh/live access was performed for this follow-up. Only this report was appended.

### 6.1 Updated v1 scope

**Confirmed decisions:**

- Goals remain private on Profile; max five active goal series.
- Volume: **distance, workout count, recorded minutes** only; user selects **one sport or all sports**. Distance choices are run/walk/cycling/all (supported recorded-distance sources); count/minutes offer all eight types/all. Weekly/monthly repeating or one-time with end date. Total-weight volume is dropped entirely; no tonnage/FF lifting-expansion/body-mass work for v1.
- Add optional whole-minute duration to **Quick Log (all types)** and **Detailed strength/powerlifting**, retaining fast blank submission. Other workout paths count recorded duration; do not promise measured active-only time.
- Performance: any eligible qualifying result using existing `heaviest_single`/`distance_time` matching, **not only new PRs**. Lift is at least target load at exactly one rep; time must be **strictly faster** than target. Preserve the current five distance lanes, three sports and canonical/custom movement identities described in section 1.
- Credit only after goal creation, no past credit; precise recommended interpretation is below. Calendar weeks start **Sunday**.
- Hand-marked completion for time/lift remains **private with no badge**, even when a workout post exists. Manual volume completion is not added by this plan. No manual-post linking or standalone announcement work.
- Automatic completion remains private until the owner explicitly shares its Goal badge. Goal parent/progress stays private after sharing.

### 6.2 Optional duration: reuse existing storage, do not add a duplicate column

**No new workout duration column is needed.** `workout_sessions.duration_minutes` is already a nullable integer; both input and canonical validation already allow optional/null integer **1–1440** (`packages/db/src/schema.ts:355–387`; `packages/validation/src/index.ts:296,406,428–450`). It is persisted on create/update (`packages/db/src/index.ts:1149,1275`). The missing feature is form collection/hydration, not DB capacity.

Implementation outline, only after approval:

1. Quick Log: add labelled “Duration (minutes) — Optional” number field. Blank maps to null, never zero; filled must be integer 1–1440. Send `durationMinutes` instead of hardcoded null; keep `metrics: []` / `movements: []`. No cardio distance-time PR can be inferred from duration alone (`apps/mobile/app/groups/[id]/log-workout.tsx:169–183`).
2. Detailed strength/powerlifting: add the same field; submit its value instead of the current computed null. Hydrate from `workout.durationMinutes` on edit, preserve an untouched value, allow explicit clearing, and avoid leaking a stale field across workout-type changes (`apps/mobile/app/groups/[id]/detailed-workout.tsx:146–171,303–343`). This also preserves optional duration from a Quick Log when edited through Detailed Workout.
3. Reuse existing JSON `durationMinutes` validation. Add client blank/range/integer checks and server regression tests; **do not broaden strength's allowed metric types** just to store minutes. Strength currently disallows metric rows but already accepts the duration column (`packages/validation/src/index.ts:308–325`). No schema version or required field is needed; older clients omitting it remain valid.
4. Keep precise cardio/FF duration authoritative where it exists; do not sum its rounded `duration_minutes` summary as another contribution. Aggregate seconds internally: numeric duration metric first, else applicable precise FF result/length/cap, else entered/legacy `duration_minutes × 60`. For interval-only minutes, recommend a final fallback summing known **work-segment duration_seconds once, excluding recovery**; disclose partial coverage as recorded work time, never infer a complete elapsed/active duration. Missing values add no measured time and show a missing-duration hint. Session-level duration always wins over segments, preventing duplication.
5. New migrations cover Goals/security only; no duplicate seconds/minutes column, zero-filled historical duration backfill, or duration constraint against uninspected historical rows is proposed. Validation tests prove blank/null, 1, 1440, fractions, zero and over-limit behavior. A filled Quick Log must still count once regardless of optional minutes.

### 6.3 “Logged after creation”: two timestamps, two jobs

**Recommended clarification (not a new confirmed decision): require both a new log AND a post-start performance.**

Let `activation_at` be the server-owned eligibility cutoff: initial goal creation time, or a new cutoff on explicit reopening. Store it independently from immutable original `goals.created_at` for later reopen/versioning.

A workout is eligible only when:

- `session.created_at > activation_at`: the log was first persisted after this activation, and
- `session.occurred_at >= activation_at`, within the goal's performed-date period/deadline and `<= server_now`: no pre-goal performance is credited merely by backdating a new log.

`created_at` is the **admission gate**; `occurred_at` assigns the Sunday week/month, achievement date and deadline. Post publication time, source set ids and mutable `updated_at` do not establish new-log eligibility. A pre-existing workout edited after creation remains ineligible. Example: goal created Sunday at 10 AM CT; a Saturday workout newly logged Sunday afternoon does not count; a Sunday noon workout first logged Monday can count in its original period, subject to grace.

Existing API creation assigns `createdAt = new Date()` server-side (`packages/db/src/index.ts:1129–1155`), whereas the schema also has a DB default; user input validates occurrence, not session creation time. Implementation must retain immutable, trusted server-created timestamps and use one authoritative clock for goal/session creation cutoffs (prefer DB-generated creation instants for these writes), rather than device clocks. Do not rewrite historical creation timestamps. Handle strict-cutoff equality consistently and test concurrent goal/log creation.

**Late-log admission default:** seven local calendar days after the period/deadline closes, with Sunday/month boundaries evaluated in the goal zone. Store `credit_closes_at`; require initial session creation before that instant. Grace permits delayed entry of **post-start, in-period** workouts, never pre-creation performances or post-deadline performances. It limits initial log admission, not legitimate later corrections to already-admitted records. An expired one-time goal can become reached from an eligible late log during grace without reoccupying an active slot. Undated performance goals have no closeout cutoff until archived/completed. No scheduled notification/job is implied.

### 6.4 Revised tables, invariants, migrations and privacy

**`goals` — private**

- UUID id/user_id; title; `kind` volume/time/lift; metric workout_count/distance/minutes/load/time; `sport_filter` nullable (null = all for volume, canonical type otherwise).
- Positive canonical target: integer count, metres, seconds (for minute accumulation/time target), kg (lift); display unit. CHECK kind/metric/unit and sport compatibility. Operator fixed to `>=` for volume/lift and `<` for time; no tonnage fields.
- Exact `pr_kind` / `pr_key` for performance (`hs:id:...`, `hs:name:...`, `dt:<sport>:<lane>`); no movement-name guessing or identity aliasing. Performance sport selection must agree with key; lift can match either eligible strength type through its shared movement key.
- Schedule one_time/weekly/monthly (recurrence volume only); performed start, optional end-exclusive deadline (required for one-time volume); fixed IANA `time_zone`, Sunday week policy; `activation_at`; definition version; original created_at/updated_at.
- State active/reached/expired/archived/needs_review plus nullable active_slot. Index owner/state; optional reconciliation/closeout index for expired goals still inside grace.

**`goal_periods` — private completion ledger**

- id, goal_id/user_id composite ownership FK, definition/activation version, non-null calendar period key/start, nullable period end for undated one-time performance goal, effective eligible start, fixed timezone/target snapshot, `credit_closes_at`.
- UNIQUE goal/version/period key; pending/reached/invalidated state; method auto/manual; reached_at/recorded_at; source session/set ids and qualifying-result snapshot; optional originating post id; celebration delivery marker. Cached progress optional/non-authoritative. Set ids are replaced on edits, so preserve snapshot/session context and rederive evidence.
- Manual method never grants badge eligibility. A manually reached goal does not later become shareable automatically; reopening is a new prospective activation.

**`community_post_goals` — shared snapshot, sibling to PR badges**

- id, user_id, goal_period_id/completion id, post_id, source session id, minimal label/target/result/reached-date snapshot, created_at. No private notes/progress.
- Default **one selected originating post per completion**: UNIQUE completion id plus post lookup index; post+completion also idempotent. Ownership/source/session consistency checked on write; manual completion refused server-side. No global user/PR-key uniqueness because recurring goals and separate targets must coexist.
- Post deletion cascades badge only; goal/period deletion cascades goal badges; account deletion cascades all owned feature data. No FK to mutable personal_records is required for durable evidence.

**Five-slot enforcement:** slot 1–5, active/inactive nullability CHECK, per-user partial UNIQUE slot. API serializes allocation; reached/expired one-time goals release, recurring series retain until archived/ended. Reopen at cap returns 409 and leaves previous completion unchanged. Evidence invalidation never silently creates a sixth active series.

**RLS:** ENABLE/FORCE on all three; revoke PUBLIC/anon/authenticated writes; authenticated SELECT-only. Goals/periods owner-only. Shared badges owner or authorized visible nonremoved crew post with bidirectional block filtering, using #55 helpers and minimal snapshots. Server API independently enforces ownership, manual-unshareability, active membership/open crew, moderation/report/author-watermark and block rules because its DB role bypasses RLS. Reuse `private.can_access_community_post` / `private.is_blocked_between`; no RLS disabling or broad crew read of private goal parents (`supabase/migrations/20261109000000_personal_records.sql:44–121`).

**Migration outline:** new reviewed Drizzle migration after 0018 for goal tables/FKs/checks/slots/indexes; separate later Supabase RLS migration with permissions installed before feature exposure; metadata/journal generated only during approved implementation. Existing duration column and validation need no additive DB migration. New goals start empty; no history credit/PR backfill/duration invention. All live application remains for Josue after explicit approval.

### 6.5 Progress/reach and mutation flow

- Derive per-session contributions in canonical seconds/metres/count before combining; filter owner, one-sport/all, creation admission, performed window, future exclusion and late-log cutoff. Count sessions once independent of post count. Persist one completion per goal-period, including first cumulative threshold-crossing session context.
- Any qualifying performance means evaluate the **session's PR-compatible candidates**, not `pr.detected`, `personal_records.celebrated`, or lifetime PB value. First quiet baseline, tie and below-lifetime-PB performance can reach a goal. “Not a PR” remains solely a PR classification; it does not invalidate a recorded qualifying result for Goals. Keep PR prompts/badges otherwise unchanged.
- Reuse exact extractor identities and comparisons; lift `candidate.loadKg >= goal.targetKg`, time `candidate.durationSeconds < goal.targetSeconds`. No first-result confirmation is required for automatic goal reach. Explicitly exclude incomplete sets (existing PR extraction lacks that guard); review integration rather than silently inheriting incorrect incomplete evidence (`packages/db/src/pr-detection.ts:323–399`).
- Run goal evaluation in session create/edit/delete transactions alongside existing PR hooks, with before/after occurrence windows and evidence retained. Recompute goals from eligible session history on edits/deletes; lifetime PR recompute does not cover all eligible non-PR performances. Invalid automatic evidence withdraws dependent badges or replaces evidence without moving/sharing a badge automatically. Manual completion remains private and is not invalidated by unrelated workout edits.
- Return goal completions even with no PR prompt/detected result; one sequential celebration/share flow prevents the previous modal-over-modal regression. Share/unshare/Undo operate on goal badge ids without altering achievement or PR badges. Manual completion has no share CTA and the API rejects forged share attempts.
- Lazy rollover/read-derived progress plus transactional write reconciliation suffice; evaluate current active series and expired periods still admitting late logs, not only currently active rows. Snapshot old periods, prevent duplicate celebration/share on retries, invalidate Profile/feed caches after duration/goal changes. No new background job for v1.

### 6.6 Recommended defaults still requiring sign-off

Each row is one recommended choice, not an already-approved decision.

| Remaining choice | Recommended default | One-line reason |
|---|---|---|
| Does Quick Log count? | **Yes, one saved session counts even with no duration.** | A quick accountability check-in is already a performed session; minutes stay optional. |
| Interval-only distance, no total | **Sum known work-segment distances once, exclude recovery; session total wins if present.** | Uses recorded work without inventing distance or double counting; disclose partial coverage. |
| Late-log grace | **Seven local calendar days after period/deadline end, with both creation and performed-start gates above.** | Accommodates delayed logging without allowing pre-goal or post-deadline achievements. |
| Timezone | **Capture/validate device IANA zone at goal creation and freeze it per goal.** | No stored user zone exists, and fixed IANA rules preserve DST/calendar boundaries while travelling; ask for a valid zone if unavailable rather than silently using UTC. |
| First repeating period | **Partial current calendar period from creation; full target, no prorating or earlier credit.** | Honors no-past-credit and keeps weekly/monthly targets stable; show first period's short dates clearly. |
| Slots/reopen | **Reached/expired one-time frees its slot; recurring reach does not. Reopen needs a free slot and resets activation/start.** | Preserves the five cap and prevents old evidence instantly completing the goal again. |
| Archive/delete/badges | **Archive stops tracking/releases slot but retains history/shared badges; explicit delete removes goal/history/badges, never workouts/posts.** | Separates reversible retirement from genuine erasure with a clear destructive warning. |
| Goal + PR row | **One mixed row, two chips total then +N; show one of each when both types exist.** | Keeps feed density bounded while ensuring a newly shared Goal is visible; mixed accessibility copy must name both types. |
| Which crews? | **Only the automatic completion's originating workout post/crew, after explicit share; no broadcast or new cross-crew post.** | Matches today's crew-scoped sharing flow without exposing private progress to every crew. |

**Rendering check:** `apps/mobile/ui/pr-badges.tsx:13–46` currently slices the PR array to two chips, adds +N, labels every chip literally “PR” and announces personal-record counts. Feed/detail consume that PR-specific row (`apps/mobile/ui/components.tsx:374–377`; `workout-detail.tsx:951`). A mixed typed renderer is needed; simply passing Goal data into PrBadgeRow would mislabel it. Preserve noninteractive chip/+N behavior; no new overflow sheet is required for v1. Use the same mixed ordering/counts in feed and detail.

**Crew mapping check:** each community post belongs to exactly one `group_id`; `(group_id,workout_session_id)` is unique (`packages/db/src/schema.ts:705–743`). Current PR share takes `groupId + sessionId`, finds an existing nonremoved post for that exact pair, then attaches badges to its post id (`packages/db/src/personal-records.ts:159–215,651–674`; `apps/mobile/lib/pr-api.ts:23–31,66–85`). It does not fan out to all memberships. In fact it deletes the previous shared badge for that user/kind/key globally before insertion, backed by the global unique index (`packages/db/drizzle/0018_first_ultron.sql:52`). For Goals, choose one originating post **per completion**, not a global movement-key replacement. For a cumulative goal, use the workout that crosses target. Share copy must say “Share to <that crew>,” even if Profile's currently selected crew changed. If that post is gone/inaccessible, keep completion private; no arbitrary-post fallback. Different repeating periods can badge their own originating posts in different crews.

### 6.7 Revised estimate

One engineer, after scope/default decisions + approved Studio mocks; developer-days, not elapsed calendar days.

| Workstream | Dev-days |
|---|---:|
| DB/RLS: three tables, ownership/period/slot constraints, migrations/security policies | 2–3 |
| API/domain: eligibility/grace/Sunday-IANA periods, sport filters, recorded aggregates, candidate-based reach, mutation reconciliation, lifecycle/share | 3–4 |
| Mobile: Profile Goals CRUD/detail/states, **Quick Log + strength optional duration with edit hydration**, mixed badges and sequential celebration/share/Undo | 4–6 |
| Tests/device: isolated DB/RLS/concurrency, duration round-trip and boundary tests, Duo/iPhone regression fixes | 2–3 |
| **Total revised v1** | **11–16** |

Weight-volume removal eliminates the previous FF-tonnage/actual-load expansion. Optional duration UI/edit preservation, prospective gates, IANA/grace/lifecycle behavior and mixed rendering remain substantive work. Excludes notifications, arbitrary distance/benchmark PR kinds, standalone announcements, multi-crew publishing, true-active-time sensors, design/review waits, TestFlight processing and Josue's live migration application. No new code/tests were run for this report-only follow-up; prior 14/14 pure PR tests are not evidence of new Goals behavior.

### 6.8 Studio mock checklist

1. **Profile Goals section:** empty, active/progress, loading/error/retry, five-active limit, first short period/date range, missing-duration/partial-distance helper, reached/expired/needs-review, archive/history access; folded/unfolded/Split View.
2. **Create/edit volume:** metric distance/count/minutes, one sport/all, target + unit, weekly/monthly/one-time end date, Sunday schedule/fixed-zone summary, partial-first-period explanation and field validation.
3. **Create/edit performance:** existing sport/distance lanes + strictly-under time; canonical/custom lift picker + lb/kg target; optional deadline; private/default and no-past-credit summary; validation.
4. **Goal detail/history:** progress/evidence, auto reached, manual private reached with no Share button, late-log/grace and missing-source states, expired/reopen-at-cap, definition/version history if surfaced.
5. **Quick Log + Detailed strength/powerlifting:** optional minutes blank/filled/invalid, edit hydrated/cleared, save loading/error, keyboard/compact layouts; preserve existing locked (+)/chooser/header.
6. **Completion/share:** goal-only and goal+PR combined result, sequential presenters, explicit “Share to <origin crew>”/Not now, share failed/retry, no-post/inaccessible post; manual-done confirmation has private-only copy.
7. **Feed/post detail badges:** none/one/two/3+ mixed Goal/PR chips, +N, combined VoiceOver copy, remove/Undo toast within content pane above nav.
8. **Lifecycle confirmations:** manual done, reopen with fresh-start warning/cap error, archive vs delete with badge-retention/removal explanation, unshare; top-left X and existing tokens/pane templates throughout.

**Next gate:** Friday can send the confirmed scope, nine recommended defaults, estimate and mock checklist for sign-off. No implementation, branch, PR or live migration is authorized by this study.
