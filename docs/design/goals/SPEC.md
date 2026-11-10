# Goals — SPEC

**FINAL · approved by Josue Nov 10, 2026, 11:49 AM CT · ready for Dev handoff via Friday**  
**Folder:** `/workspace/design-pass/goals/`  
**Locks:** `/workspace/design-pass/DESIGN-LANGUAGE.md` incl. **D8** (`brandPressed` #9E3500). No DESIGN-LANGUAGE change.  
**Board:** `BOARD-goals.png` · `BOARD-goals-share.jpg`  
**Sources:** `/workspace/goals-feasibility/REPORT.md` §6; PR detection board as the style reference; logging mocks reused for Quick Log / Detailed backgrounds.  
**ClickUp:** 86bcz5r6n

Copy rule: always **crew**, never “group”. Voice: friendly, short, plain. Goals are **private** until the owner shares a badge to an existing crew post. Light mode only.

---

## Decisions (Josue, Nov 10, 11:49 AM CT)

| # | Decision | Effect |
|---|---|---|
| J1 | **Goals and crew “this week” both run Sun–Sat**, device-local | No mismatch. Goals UI may show a quiet “Sun–Sat” or a date range. Crew “workouts this week” moves off Mon–Sun (see Dev note below). |
| J2 | A Quick Log **with no duration still counts** as a workout | One saved session counts toward a workout-count goal. Blank duration is `null`, not zero, and adds no minutes. |
| J3 | Interval-only distance: **sum work segments once**; **session total wins** if present | Exclude recovery. Do not invent or double-count distance. |
| J4 | Late-log grace is **7 local calendar days**, with both gates | Creation gate and performed-start gate still apply after the period or deadline ends. |
| J5 | **Freeze the device IANA zone** at goal creation | Ask for a valid zone if none is available; do not silently use UTC. |
| J6 | First repeating period is the **partial current period**, **full target**, **no prorate**, no earlier credit | Show the short first-period dates clearly (e.g. “Sun Nov 9 – Sat Nov 15”). |
| J7 | **One-time** reached or expired **frees a slot**; **recurring reach does not**. Reopen needs a free slot and a new `activation_at` | Past workouts do not count again after reopen. |
| J8 | **Archive** keeps history and shared badges; **delete** removes the goal, history, and Goal badges | Workouts and posts always stay. |
| J9 | Share only the **originating workout’s existing post / crew** | No broadcast, no new post, no notification. If that post is gone, the completion stays private. |
| J10 | Goal badge is the **orange outline** chip (surface fill, brand border, brandPressed text). **Brand-fill proposal dropped.** | Distinct from the tonal PR chip (`brandTint` / `brandPressed` / `boardBorder`). No gold, no new token. |
| J11 | Mixed-row VoiceOver as recommended, **SPEC only** (never on the canvas) | “Goal reached and personal record”; “Goal reached and {n} personal records”; “{n} goals reached”; “{n} goals reached and personal record”. Same row in feed and detail. |

Everything else approved as drawn (Profile states, create/edit, detail and lifecycle, duration field, celebration + share, mixed 2-chip-then-+N row, Duo / Split View toast in the content pane, Reduce Motion static check).

**No DESIGN-LANGUAGE change.** Celebration check stays `success` / `successSoft` (status only, DESIGN-LANGUAGE.md §2.1), same as PR detection.

---

## 0. Scope (locked Nov 10)

### In
- Goals are **private**, live on **Profile**, **max 5 active**.
- **Volume:** distance, workout count, or minutes; one sport or all sports; **weekly or monthly repeating**, or **one-time with an end date**. Weeks run **Sun–Sat**, same as crew “this week” (J1).
- **Time:** Run / Walk / Cycling (ride) at **1 mi, 5K, 10K, half, marathon**. Strictly faster than the target.
- **Lift:** heaviest **1-rep** single, at or above the target (lb or kg).
- Time and lift may have an **optional deadline**. They complete automatically on any qualifying performance, or **by hand**. Hand-marked stays **private, no badge**.
- **Only workouts logged after the goal is created count.**
- When a workout reaches a goal, the owner can **share** — that adds a Goal badge to that workout’s **existing** crew post.
- Goal and PR badges **share one row**: up to **2 chips, then +N**. If a post has both types, show **one of each**, then +N for the rest.
- Optional whole-minute **Duration** on Quick Log (all types) and Detailed strength / powerlifting, including edit. Blank = `null`, not zero. Valid range **1–1,440**. Reuse `workout_sessions.duration_minutes` (no new column).

### Out (no placeholders)
Total-weight volume · manual completion of volume goals in v1 · notifications · broadcast or new cross-crew posts · gold / new achievement color · repo or product-code changes in this pass.

---

## 1. Tokens

| Token | Value | Use here |
|---|---|---|
| brand | #C94300 | primary buttons, (+), **Goal badge outline** |
| brandPressed | #9E3500 | tonal labels, selected chips, PR badge text, **Goal badge text**, eyebrows (D8) |
| brandTint | #FFF1E6 | PR badge fill, type chips, soft callouts |
| boardBorder | #F6E3D6 | tonal / badge edges |
| background | #FFFAF4 | screens |
| surface / surfaceMuted | #FFFFFF / #FFF7F0 | cards / soft rows |
| border | #F0E4DA | card edge |
| success / successSoft | #2E7D5B / #EAF6F1 | **Status only, never a button** (DESIGN-LANGUAGE §2.1). Celebration check, “Reached” chip, completed progress bar. |
| danger | #B42318 | Delete confirm; duration validation; share error. Not used for unshare (Undo toast). |
| disabledFill / disabledText | existing tokens | Reopen at the 5-goal cap |

Type: Fredoka headings; Nunito body. X top-left on modals/sheets (D7). ≥44 pt targets. Phone 390 wide; (+) in the top bar. Duo folded 466×678, unfolded 951×669, strip on the right; (+) strip only, never also in the header. Side strip, back button, and top-left X stay as locked. Undo toast stays **inside the content pane** in Split View (the #57 fix).

### Goal badge (J10, locked)
- Fill `surface` (#FFFFFF), **2 pt `brand` outline**, text `brandPressed`, height 20, radius 9, 11 Bold, label **`Goal`**.
- VoiceOver: **“Goal reached”** (multi: **“{n} goals reached”**).
- Distinct from the locked PR badge (`brandTint` fill, `brandPressed` text, `boardBorder` edge, label **`PR`**, VoiceOver **“Personal record”**): outline + white vs filled light-orange. No gold. The brand-fill treatment was dropped.

### Mixed row
If the post has both types: show **Goal, then PR**, then `+N` for the remainder. If only one type: up to two of that type, then `+N`. Same rule in feed and post detail. a11y copy is in J11 — **never drawn on the card**.

---

## 2. Create / edit

One form, title **New goal** or **Edit goal**. No “Preview — see how your crew sees it” row (goals are private). Sticky **Save goal** / **Save changes**. X top-left.

**Type tiles:** Volume, Time, Lift.

**Volume:** metric (Distance / Workouts / Minutes) · sport (one or All sports) · target + unit · Repeats (Weekly / Monthly / One-time). Weekly helper: “Sun–Sat. Only workouts you log after you save this count.” One-time requires an **end date**.

**Time:** sport Run / Walk / Ride · distance lanes 1 mi, 5K, 10K, Half, Marathon · target min + sec (strictly faster) · optional deadline.

**Lift:** movement picker · target + lb/kg · “Reached on any 1-rep set at or above {target}.” · optional deadline · helper that marking done by hand stays private, with no badge.

Edit is the same form, pre-filled.

---

## 3. Profile + detail + lifecycle

**Profile Goals** sits on the Profile tab (no back on the tab root; phone (+) in the top bar). States: empty (“Set a goal”), in progress (rows + “Add a goal” + History), at 5-cap (helper, no add), History, error + “Try again”.

**Detail** (back + title “Goal”):
- In progress: period or deadline, last qualifying log, “Only workouts logged after you created this goal count.” Archive / Delete. Time and lift also get **Mark as done** (tonal), which opens a confirm: this stays private, with no Goal badge.
- Reached (auto): success treatment, optional “Share with {origin crew}” if the originating post still exists.
- Expired: muted status, **Reopen goal**. Disabled + helper when already at 5 active.
- Marked done by hand: muted status, no Share, no badge.

**Archive** (confirm): leaves the active list, frees a slot, keeps history and shared badges.  
**Delete** (destructive confirm): removes the goal, history, and Goal badges; workouts and posts stay; cannot be undone.  
**Reopen** (confirm): fresh start from today, uses one slot, past workouts do not count again.

Removing a Goal badge from a post is immediate, with an **Undo** toast. No confirm. Same pattern as PR unshare.

---

## 4. Duration field

Shown on Quick Log (every type) and Detailed strength / powerlifting, create and edit. Label **Duration (minutes)**, marked Optional. Blank saves `null`, not `0`. Whole numbers **1–1,440** only. Error examples: `0` and `90.5`, with “Enter a whole number from 1 to 1,440, or leave this blank.” Logging backgrounds, eyebrows (**QUICK CHECK-IN** / **DETAILED WORKOUT**), Preview row, and (+) / chooser / header stay as the locked logging mocks.

---

## 5. Celebration + share

Private first. Success check (status only). Copy: just for you until you share; sharing badges the post you just logged.

If the same workout also set a PR, **one combined celebration** (“Goal reached and a new PR”) lists both, then a single share prompt badges the **same** post with Goal and PR.

Share sheet: “Share with {origin crew}?” · Share / Not now. “Adds a Goal badge to the post you just logged. Same post, no extra notification.”

**No post / inaccessible post:** celebration only, “Saved privately… nothing to share yet,” primary **Done**. No share sheet.

Share error: danger helper under the sheet, retry by tapping Share again.

---

## 6. Copy strings (canonical)

| Context | Copy |
|---|---|
| Empty | No goals yet / Set a private goal to track distance, workouts, minutes, or a time or lift target. / Set a goal |
| Cap | You have 5 active goals. Archive one, or wait for a one-time goal to finish, before adding another. |
| Error | Couldn't load goals / Check your connection and try again. / Try again |
| Weekly helper | Sun–Sat. Only workouts you log after you save this count. |
| Time rule | Reached when a qualifying {sport} is strictly faster than {time}. |
| Lift rule | Reached on any 1-rep set at or above {target}. |
| Hand-mark helper | Optional. Marking it done by hand stays private, with no badge. |
| Celebration | Goal reached |
| Combined | Goal reached / and a new PR |
| Share title | Share with {crew}? |
| Share body | Adds a Goal badge to the post you just logged. Same post, no extra notification. |
| Share actions | Share / Not now |
| No post | Saved privately. This workout isn't on a crew feed, so there's nothing to share yet. / Done |
| Share error | Couldn't share. Check your connection and try again. |
| Duration helper | Optional. Leave blank if you do not want to track time. |
| Duration error | Enter a whole number from 1 to 1,440, or leave this blank. |
| Toast | Goal badge removed / Undo |
| Archive | Archive this goal? / It leaves your active list and frees a slot. Shared Goal badges on posts stay put. You can still find it in History. |
| Delete | Delete this goal? / This removes the goal, its history, and any Goal badges on posts. Your workouts and posts stay. This cannot be undone. |
| Reopen | Reopen this goal? / This starts a fresh run from today. Past workouts will not count again, and it uses one of your 5 active slots. |
| Reopen at cap | You already have 5 active goals. Archive one first, then you can reopen this. |
| Mark as done (proposed) | Mark this done? / This stays private, with no Goal badge. |

---

## 7. Accessibility + Reduce Motion

- Chip rows: J11. Do not print a11y strings on the canvas.
- Goal chip is not a button; it is a status badge. Buttons remain ≥44 pt.
- Reduce Motion: static success check, no confetti, no bounce (same as PR detection).
- Error and disabled states use text plus color, never color alone.
- Say “crew”, never “group”.

---

## 8. Eligibility (locked J2–J6)

- Admission: `session.created_at > goal.activation_at`.
- Assignment to a week / month / deadline: `occurred_at` (performed start) in the frozen IANA zone, after the activation instant.
- Only logs after creation count. Pre-goal workouts never count, even if edited later.
- Time: strictly `<` target seconds on a qualifying distance + sport.
- Lift: load `>=` target, **1-rep only**.
- “Not a PR” does not block a qualifying goal result. Evaluate **candidates**, not only rows in `personal_records`.
- Recs for Quick Log without duration, interval distance, 7-day grace, frozen IANA zone, and the partial first period are in J2–J6.

---

## 9. Mock index

| # | File | What it shows |
|---|---|---|
| 01 | `01-profile-goals-empty.png` | Profile Goals, empty |
| 02 | `02-profile-goals-progress.png` | Three in-progress goals + Add + History |
| 03 | `03-profile-goals-cap.png` | 5 of 5, no add, cap helper |
| 04 | `04-profile-goals-history.png` | Reached, expired, archived (hand-marked) |
| 05 | `05-profile-goals-error.png` | Couldn't load + Try again |
| 06 | `06-create-volume-weekly.png` | Volume, distance, Run, weekly, Sun–Sat helper |
| 07 | `07-create-volume-onetime.png` | Volume, workout count, all sports, one-time + end date |
| 08 | `08-create-time.png` | Time, Run, 5K, 24:00, no deadline |
| 09 | `09-create-lift.png` | **Edit goal**, Back Squat 335 lb, deadline, Save changes |
| 10 | `10-detail-progress.png` | Weekly volume in progress |
| 11 | `11-detail-reached.png` | Auto-reached 5K + Share with Morning Crew |
| 12 | `12-detail-expired.png` | Expired half + Reopen |
| 13 | `13-detail-manual-done.png` | Marked done by hand, private, no badge |
| 14 | `14-quick-log-duration.png` | Quick Log, duration 55, optional helper |
| 15 | `15-quick-log-duration-error.png` | Duration `0`, validation error |
| 16 | `16-detailed-strength-duration.png` | Detailed strength, duration 48 |
| 17 | `17-detailed-strength-duration-invalid.png` | **Edit workout**, duration `90.5`, error |
| 18 | `18-celebration-goal.png` | Goal-only celebration |
| 19 | `19-celebration-goal-and-pr.png` | Combined Goal + PR |
| 20 | `20-share-goal-crew.png` | Share with Morning Crew? |
| 21 | `21-celebration-no-post.png` | Reached, no crew post |
| 22 | `22-share-error.png` | Share failed, retry |
| 23 | `23-feed-goal-pr-chips.png` | Feed: Goal + PR on one post |
| 24 | `24-feed-mixed-plus-n.png` | 2 goals + 1 PR → Goal, PR, +1. VoiceOver (SPEC only): “2 goals reached and personal record” |
| 25 | `25-unshare-undo.png` | After removing Goal: PR remains, Undo toast |
| 26 | `26-confirm-archive.png` | Archive confirm |
| 27 | `27-confirm-delete.png` | Delete confirm (destructive) |
| 28 | `28-confirm-reopen.png` | Reopen confirm |
| 29 | `29-reopen-at-cap.png` | Reopen disabled at 5-cap |
| 30 | `30-duo-fold-profile-goals.png` | Folded Profile Goals, (+) strip only |
| 31 | `31-duo-fold-celebration-share.png` | Folded celebration + share |
| 32 | `32-duo-fold-feed-badges.png` | Folded feed, mixed chips and +N |
| 33 | `33-duo-unfold-profile.png` | Unfolded list + detail |
| 34 | `34-duo-split-undo-toast.png` | Split View: toast stays in the content pane (the #57 fix) |

---

## 10. Dev data notes (summary)

Schema today has **no goals tables**. These notes are for the Dev handoff via Friday.

**Crew “workouts this week” window (J1, Nov 10, 2026):** the crew members-list count changes from **Mon–Sun** to **Sunday 00:00 – Saturday 23:59:59 on the person’s device**. Goals weekly periods use the same Sun–Sat window (frozen IANA zone per goal). The crew-page SPEC has a dated amendment for this change; the crew board footer still says Mon–Sun and was not redrawn in this pass.

**Propose**
- `goals` — owner, kind (volume / time / lift), definition, `activation_at`, frozen IANA zone, optional deadline / end date, status, created/updated. RLS: owner only.
- `goal_periods` — for weekly / monthly repeating; period bounds in the frozen zone; progress snapshot; first period may be short (J6).
- `community_post_goals` — sibling to PR badges, join on the originating post id. One Goal badge per goal-completion / post. Not a reuse of the PR row (a mixed renderer is required; feeding Goal data into `PrBadgeRow` would mislabel it).
- **5 active slot** enforced in the database (unique / check), not only in the client.
- **Reuse** `workout_sessions.duration_minutes`. Blank = `null`, not `0`. No new duration column. Range 1–1,440.

**Eligibility**
- Admission gate: `session.created_at > goal.activation_at`.
- Period / deadline assignment: `occurred_at` in the frozen IANA zone.
- Both gates required, including during the 7-day late-log grace (J4).
- Evaluate qualifying **candidates**, not only `personal_records`. A “Not a PR” result can still complete a goal.
- Time: strictly faster. Lift: `>=` target at 1 rep.
- Recompute progress if a session is edited or deleted.

**Share and privacy**
- Auto completion stays private until the owner shares.
- Share attaches to the **existing** originating post only (J9). No new post, no notification, no fan-out.
- Hand-marked completion never writes `community_post_goals`.
- Archive keeps shared badges; delete removes them. Workouts and posts are never deleted.
- Recurring reach does not free a slot; one-time reached or expired does. Reopen resets `activation_at` and needs a free slot (J7).

**Estimate (feasibility §6.7, after this SPEC is approved):** 11–16 dev-days. Not a commitment in this design pass.

---

## 11. Out of scope here

Cloning or changing the app repo in this design pass · gold or a new achievement token · total-weight volume · manual volume completion · notifications · multi-crew broadcast · changing DESIGN-LANGUAGE.md.
