# repin design language: Direction A, evolved

> **FINAL — approved by Josue Oct 31, 2026. This is the reference for all future work.**
> Repo: `Swayzee20/repin`. Read remotely only at main `1c21812c22` and PR #10 head `0d795aec55` (branch `cursor/safe-reserved-regions-989c`). No code was changed.
> Boards (FINAL): `docs/design/00-overview.png` … `docs/design/12-design-language-board.png`.
> The proposal is archived as `DESIGN-LANGUAGE.proposed.md` and `mockups/_proposed/`.
> All paths below are under `apps/mobile/` unless stated otherwise.

## 1. Decisions log

| # | Decision (Josue, Oct 31 2026, ~11:44 AM CT) | Effect |
|---|---|---|
| D1 | Cards **A**: border + soft shadow | One `Card`: white, 1pt `border`, r14, e1 shadow. Border-only is not used. |
| D2 | No-strip Rep in **A**: (+) in the native top bar; 44pt (+) on web | `RepInPill` is removed. Tab roots always show the header; the (+) is the same `Stack.Toolbar` button. |
| D3 | Form close **A**: X, form opened as a modal | `log-workout`, `detailed-workout` and `edit` use `presentation:"modal"` with a round 44pt X. The round ‹ is only for pushed screens. |
| D4 | The "+ Rep in" pill showing with the strip is a **bug** (TestFlight build from PR #10, ~10:30 AM CT Oct 31) | Fix in §6. Ship it first (PR 0). |
| D5 | Third tab label **"Profile"** (was "Me") | `app/(tabs)/_layout.tsx` and `_layout.web.tsx`. |
| D6 | **Merge the duplicate colour names; drop radii 9 and 18** | §2.1 and §2.3 mappings. |
| D7 | **X close top-left everywhere** (Oct 31, 2026, approved by Josue) | Every modal and sheet (form modals, (+) chooser, pickers) puts its 44pt X top-left, with or without the strip. Replaces "X at the top of the strip" (§3, §5.2, §8, §9). Oct 31, 2026: includes the photo viewer (row 11, §5 fix 3). |
| — | Locked, unchanged: the strip tab pill (Home / Community / Profile) and the round orange (+) | Every token below is derived from them. |

## 2. Final tokens (`ui/theme.ts`)

### 2.0 Locked reference (measured from Josue's `home.png` @3x)
- **(+):** 48pt circle, brand fill (renders ≈ #B74B1E under iOS tint). Gives `size.control = 48`.
- **Tab pill:** ≈50×162pt capsule. Glass fill ≈ #FFFBF6 with a ≈ #ECE3DB hairline.
- **Selected tab:** ≈49pt circle, #EBE7E1, brand icon. Gives the `selection` token and the "selected = neutral fill + brand content" rule.
- **Strip:** has no background; content never paints behind it.

### 2.1 Colour (exact values)
| Token | Value | Notes |
|---|---|---|
| brand | #C94300 | the only "act" colour |
| brandPressed | #9E3500 | |
| **brandTint** (new) | #FFF1E6 | selected tiles, tonal button |
| background | #FFFAF4 | every screen (no white screens) |
| surface | #FFFFFF | cards, inputs |
| surfaceMuted | #FFF7F0 | soft panels |
| ink / inkSoft / muted / subtle | #2B211C / #4A3B33 / #6B5B52 / #7A6A61 | `subtle` never for "Optional" or helper text |
| border / borderStrong | #F0E4DA / #E3D5CB | card / input |
| boardBorder | #F6E3D6 | kept (distinct value) |
| **selection** (new) | #EBE7E1 | from the locked tab pill |
| **glassFill** / **glassEdge** (new) | #FFFBF6 / #ECE3DB | glass controls |
| **disabledFill** / **disabledText** (new) | #EFE5DC / #8C7B70 | |
| success / successSoft | #2E7D5B / #EAF6F1 | status only, never a button |
| danger / dangerSoft | #B42318 / #FDECEA | |
| accent | #F5B83D | fill-only |
| accentCoral | #F28C6B | fill-only |
| warningSoft | #FFF4DE | kept (distinct; 0 uses today) |
| overlay (scrim) / overlaySoft / overlayStrong / overlayLine | rgba(43,33,28,.28/.16/.72/.32) | unchanged |
| **scrimPhoto** (new) | rgba(18,18,18,.88) | replaces the literal in `ui/photo-viewer.tsx` |
| feedFade / feedFadeSoft / boardTransparent | unchanged rgba values | rename optional |

**Merged names (old → new; values identical, so no visual change):**
- `brandSoft` → `surfaceMuted` (22 uses)
- `board` → `surfaceMuted` (2)
- `feed` → `surfaceMuted` (4)
- `achievement` → `accent` (0 uses)
- `warning` → `accent` (0 uses)

Delete the old keys. Note: `brandSoft` is used today for *selected* states (`ui/workout-type-selector.tsx:198,219`, `ui/workout-detail.tsx:1190,1200,1209`, flameButtonActive `log-workout.tsx:595` / `detailed-workout.tsx:527`, `community/index.tsx:876`). The token PR maps them to `surfaceMuted` value-for-value. The component PRs then move them to `brandTint` / `selection` per §3.

### 2.2 Type (10 steps; no literal `fontSize`)
| Token | Spec |
|---|---|
| display | 32/39 Fredoka −0.64 |
| screenTitle | 26/33 Fredoka −0.52 |
| title | 22/29 Fredoka −0.44 |
| heading | 19/25 Fredoka −0.38 |
| **cardTitle** (new) | 19/25 Nunito Bold (every post title: card, pane, modal) |
| **section** (new) | 17/23 Nunito SemiBold |
| body / bodyMedium | 16/23 |
| bodySmall | 14/20 |
| label | 13/18 SemiBold |
| eyebrow | label ExtraBold, letterSpacing +1.1 |
| **micro** (new) | 11/14 Nunito Bold |
| button | 16/20 ExtraBold |

**Remapping the 100 literals:**
- 9, 10 → micro
- 12, 13 → label
- 14, 15 → bodySmall
- 16 → body
- 17, 18 → section
- 19–21 → heading
- 22–25 → title
- 26 → screenTitle
- 28 and up → display (or the icon size, when the literal is a glyph that becomes an icon)

### 2.3 Radius
`radii = { sm: 8, md: 10, lg: 14, pill: 999 }`. `input` and `xl` are deleted.

**Remap:**
- `radii.input` (9) → `radii.md`: 3 files (`ui/components.tsx`, `ui/workout-type-selector.tsx`, `ui/community-date-picker.web.tsx`)
- `radii.xl` (18) → `radii.lg`: 4 uses (`app/groups/[id].tsx`, `ui/workout-type-selector.tsx`, `ui/workout-detail-modal.tsx`)
- literal `borderRadius: 9` (`app/sign-in.tsx:175`) → `radii.md`
- literal `10` (`:177`) → `radii.md`
- `borderRadius: 0` at `ui/components.tsx:831` stays. The one at `ui/detailed-run-fields.tsx:387` goes away with the boxed number field.

**Rule:** sm for chips and small pills, md for inputs, buttons and tiles, lg for cards, sheets, modals and photos, pill for capsules and circles.

### 2.4 Elevation (`boxShadow`, 3 levels)
- **e1** card: `0 2 8 rgba(43,33,28,.06)`
- **e2** popover/menu: `0 6 20 rgba(43,33,28,.12)`
- **e3** modal: `0 16 40 rgba(43,33,28,.18)`
- **glass control:** `0 3 10 rgba(43,33,28,.10)`

**Delete:**
- `floatingSurfaceStyle` (`ui/theme.ts:59-69`)
- floatingWorkout (`ui/components.tsx:810-819`)
- the animated board-card shadow (`app/(tabs)/community/index.tsx:352-368`)
- control shadows (compactSelector / compactControl)
- every `elevation:` and `shadow*` prop (41 today)

### 2.5 Size and spacing
- **Sizes:** 44 minimum hit · 48 control · 52 primary button and list row · 36 visual icon button (44 hit) · avatars 24/36/44/64 · icons 20 (16 in chips).
- **Spacing:** 4 8 12 16 20 24 32 40. Card padding 16 (form group cards 20).
- **No `minHeight` below 44** on anything pressable. There are 11 today (30, 34, 36, 38, 40).

### 2.6 Pane templates (Duo unfolded with the strip)
- **T1 Brand + form:** auth and onboarding.
- **T2 Context + action:** settings, join and create flows.
- **T3 List + detail:** Home, Community, Profile, group detail.
- **T4 Fields + preview:** workout forms, which present as a modal.

Panes come from `TwoPane` / `useLayoutMode()` (`ui/layout.tsx`). On compact, folded, upright or web layouts, each template folds into one column. Every scroll container carries the 12pt bleed (§5, fix 4).

## 3. Component rules

- **Card:** white, 1pt `border`, `radii.lg`, e1. Padding 16. Selected = the same card plus a 2pt brand inset ring. One component (`Card` in `ui/components.tsx`); no per-screen card styles.
- **RoundIconButton** (new): 44pt circle. Two looks:
  - glass: glassFill, 1pt glassEdge, glass shadow, ink 20pt icon
  - on photos: rgba(18,18,18,.66) with a 1pt white ring at 35%

  Kinds: `close` (X), `back` (‹ chevron icon), `plus` (brand fill, header only).
- **Back/close placement:**
  - Modal (forms) and every sheet: X top-left, with or without the strip (D7).
  - Pushed screen: round ‹ top-left of the left pane / header.
  - The text `BackButton` (`ui/components.tsx:148-154`) is deleted (16 uses).
- **Segmented control:** glass capsule, 48pt track, 4pt inset, `selection` thumb, brand SemiBold text. `size="sm"` is a 36pt track with hitSlop 4. It replaces 4 variants: `ui/quick-log-results.tsx` (36), exercises unitToggle (34), `ui/detailed-run-fields.tsx` subtypeToggle (38) and UnitToggle (38×38).
- **Buttons** (52pt, `radii.md`, `type.button`):
  - primary: brand, pressed `brandPressed`
  - loading: spinner + verb ("Logging")
  - disabled: disabledFill / disabledText, plus a helper line saying why (never opacity)
  - secondary: surface + borderStrong
  - tonal (44pt): brandTint + brand text (inline "Done"; green is never a button)
  - danger: destructive confirm only
- **ListRow:** 52pt, label left, value + chevron icon right, pressed = `selection`. No ‹/› text glyphs.
- **Sheets:** top `radii.lg`, grabber, 44pt X, rows ≥48. No text "Cancel" row.
- **Modals:** e3, `radii.lg`, own 56pt header row with a RoundIconButton X. The composer is pinned.
- **Empty / error / loading:** `StateCard` (`ui/components.tsx:270-283`) = Card + optional 36pt icon + heading + bodySmall + optional 48pt secondary action.
- **Icons:** one set (SF Symbols on iOS via NativeTabs / expo-symbols; one vector set on web). No ✓ ⌂ ‹ › text glyphs.

### 3.1 Form components (board 10)

| Control | Spec | States |
|---|---|---|
| TextField | 48pt, `radii.md`, 1pt borderStrong, body 16, 16 padding | focus 2pt brand (padding −1) · filled · error 2pt danger + alert-icon helper (label, danger, live region) · disabled |
| TextArea | min 96, grows to 160 | same |
| Picker | TextField shell + chevron; opens the type sheet | same |
| SegmentedControl | §3 | default / pressed / selected / disabled |
| NumberField | boxed 48pt + suffix inside ("min", "sec", "mi"); number or decimal pad | error ("0-59 only") |
| FlameRating | 5 × 44pt tiles; empty = grey flame at 35%; word label; radio-group a11y | — |
| DateRow | ListRow: label 16 Bold, value 15 muted | — |
| PhotoTile | dashed `radii.lg` tile, camera icon + "Add photo". Filled: photo + 32pt dark X (44 hit) | error "Upload failed. Retry" |
| ChoiceTile | 48pt `radii.md`, 15 left-aligned. Selected = brandTint + 2pt brand + check | disabled |

**Spacing:**
- label → control 8
- control → helper 6
- field → field 16
- group card padding 20
- card → card 16

**Labels:** 15 Nunito Bold, inkSoft. "Optional" is 13 Medium `muted`. Web: a 2pt brand `:focus-visible` ring on every pressable.

## 4. Per-screen changes (all 27)

| # | Screen | Files | Changes |
|---|---|---|---|
| 1 | Sign in | `app/sign-in.tsx` | Keep T1 TwoPane + BrandPanel. Inputs → TextField (radii.md, 48). Button → primary 52. Literal radius 9/10 (:175, :177) and link size 14 (:181, :183) → tokens. |
| 2 | Sign up | `app/signup.tsx` | WideColumn → T1. Round ‹ replaces BackButton "Sign In" (:119). confirmationIcon 64 (:156-157) → icon in a 64 successSoft circle. Disabled submit + helper. |
| 3 | Forgot password | `app/forgot-password.tsx` | T1. Round ‹ (:62). Same confirmation icon (:111-112). StateCard (:49). |
| 4 | Reset password | `app/reset-password.tsx` | T1. Round ‹ (:187). Icon (:283-284). |
| 5 | Onboarding: get started | `app/onboarding/groups.tsx` | T1: intro left, option cards right. Cards = Card + 48 icon. Chevron icon (glyph 26). Pressed = selection (was brandSoft, :87). Sign-out link → label token. |
| 6 | Create group | `app/onboarding/create-group.tsx` | T2. Round ‹ (:48). TextField 48. |
| 7 | Join group (onboarding) | `app/onboarding/join-group.tsx` | T2. Round ‹ (:156). Code input → TextField with title-size text (literal 21 → title), letterSpacing 3 kept. |
| 8 | Home | `app/(tabs)/(home)/index.tsx` | T3 kept. One Card everywhere (Highlights into a Card). 12pt bleed. ✓ → icon. Literals :536-568 → micro/label/bodySmall/section/title. weekStat bg → surfaceMuted. Remove `<RepInPill/>` (:181). |
| 9 | Community + post pane | `app/(tabs)/community/index.tsx`, `ui/workout-detail.tsx`, `ui/components.tsx` (CommunityFeed) | Post pane = one Card surface (header, body, photo, reactions, comments) with the composer pinned inside: 44pt pill field + 44pt round send. cardTitle 19 for post titles. Bleed on feedViewport (`components.tsx:826`). Remove animated board shadow (:352-368) and `<RepInPill/>` (:507, :698). Literals :872-900 → tokens. Menus = e2. |
| 10 | Post modal | `ui/workout-detail-modal.tsx` | 56pt header row ("Post" + group) with RoundIconButton X (replaces the 36pt absolute X, :227). radii.xl → lg. Composer pinned. Backdrop overlay 0.28. |
| 11 | Photo viewer | `ui/photo-viewer.tsx` | X = RoundIconButton photo look top-left at left = insets.left + 16, top = insets.top + 8 (D7) (:184, :197). Backdrop → scrimPhoto. |
| 12 | Quick log | `app/groups/[id]/log-workout.tsx`, `ui/quick-log-results.tsx` | T4 modal: fields left (type tiles, flames, date row, photo, caption in group cards), preview + pinned 52 submit right. X (D3) replaces "‹ Cancel" (:322, :360). ChoiceTile 48. Disabled spec. Fallback: preview → 44pt "Preview" row above a sticky submit. |
| 13 | Detailed / edit | `app/groups/[id]/detailed-workout.tsx`, `app/groups/[id]/workouts/[sessionId]/edit.tsx` (re-export), `ui/detailed-run-fields.tsx`, `ui/detailed-workout-exercises.tsx` | T4 modal on `background`. Fixes the 5 cut-off causes (§5). The header scrolls with the content. SegmentedControl replaces 3 variants; NumberField replaces underline inputs (:387). Tonal Done 44. X replaces "Cancel" (:332). |
| 14 | Form fallback (no strip) | same as 12-13 | X top-left header, single column, preview row, sticky submit (board 05). |
| 15 | Profile | `app/(tabs)/profile/index.tsx` | T3: identity Card + "This week" left; Groups and Account (Settings) as ListRows right. Avatar 64 → avatar token. Literals 28/23/16/11/10/9 → tokens. "›" glyph 24 → chevron icon. groupMark radius md. Remove `<RepInPill/>` (:197). |
| 16 | Settings | `app/settings.tsx` | T2: account (signed in as, Sign out) left; Danger zone Card right (dangerSoft border; TextField "DELETE" :89; danger button disabled until typed). Round ‹ (:66). |
| 17 | Group detail | `app/groups/[id].tsx` | T3: hero + invite Card left, feed right. Copy/Share → 44pt secondary/primary (were 38, text 13). Board radii.xl → lg. rolePill → chip (micro). Round ‹ (:77). StateCard error (:79). Check its overflow-visible ScrollView (§8, QA-D3). |
| 18 | Join via link | `app/join/[code].tsx` | T2: group preview left, join action right. Round ‹ (:148, :163, :197, :212). Code 24 → title. groupMark 48 → text heading. |
| 19 | Join by code | `app/groups/join.tsx` | T2. Round ‹ (:134). TextField. |
| 20 | Workout deep link | `app/workouts/[sessionId].tsx` | Same post surface as #9 (post left, comments + composer right). Round ‹ (:17). StateCard (:21). |
| 21 | Log-workout chooser | `ui/log-workout-chooser.tsx` | Sheet top radii.lg (:127). Rows 72 kept (:130). Title 17 → section (:134). "›" glyph 28 → chevron icon (:109, :136). "Cancel" row (:114) → grabber + 44pt X. |
| 22 | Workout type selector | `ui/workout-type-selector.tsx` | Sheet radii.xl → lg (:193). Rows 48 kept (:197). Selected → selection + check (:198, :219). Compact selector radii.input → md (:186). "Cancel" (:163, :202) → X. |
| 23 | Date picker | `ui/community-date-picker.tsx`, `ui/community-date-picker.web.tsx` | e3 modal, radii.lg; Cancel/Done = 44pt buttons (:47 / web :41); radii.input → md (web). |
| 24 | Menus / delete confirm | `app/(tabs)/community/index.tsx` :872-900, `ui/components.tsx` :709 | e2 popover, ListRow items, label/body tokens, danger item text. |
| 25 | Empty / error / loading | `ui/components.tsx` StateCard :270-283, LoadingState | StateCard spec (§3). "No comments yet." = bodySmall muted inside the post Card. |
| 26 | Tab bars | `app/(tabs)/_layout.tsx`, `app/(tabs)/_layout.web.tsx` | Native: LOCKED (no visual change). Label "Me" → **"Profile"** (D5). Web: one icon set (drop the ⌂ glyph + Feather + FontAwesome6 mix); web header 44pt (+) (D2). `rippleColor={colors.brandSoft}` → surfaceMuted. |
| 27 | Root stack / tab-root stacks | `app/_layout.tsx` :53-59, `ui/tab-root-stack.tsx`, `app/(tabs)/*/_layout.tsx` | Forms register `presentation:"modal"` (D3). Tab roots: header always shown, Toolbar (+) per §6. Pushed screens get the round ‹. |

## 5. The 5 fixes

1. **Rep in lives on the (+)** (locked control).
   - Strip present: the (+) shows at the top of the strip.
   - No strip: the same `Stack.Toolbar` "plus" prominent button in the native top bar (D2).
   - Web: a 44pt brand round (+) in the page header.
   - `ui/rep-in-pill.tsx` is deleted (after PR 0's hotfix). Board 08.
2. **Form close** is X with a modal presentation (D3). It sits top-left, with or without the strip (glass recipe; D7). Boards 03-05.
3. **Modal and image X:**
   - Post modal: own 56pt header, X 36 visual / 44 hit (board 06).
   - Photo viewer: 44pt photo-look X top-left at insets.left + 16 / insets.top + 8 (D7), scrimPhoto (board 07).
4. **One card + no clipping** (D1, board 09):
   - Cause: `ui/layout.tsx` PaneScroll's ScrollView frame equals the pane and its content has no horizontal padding; ScrollViews clip to bounds.
   - Fix: a 12pt bleed. Each scroll frame gets `marginHorizontal: -12`, and its content gets `paddingHorizontal: 12`.
   - iOS (Fabric, RN 0.88): boxShadow.
   - Android 9+: boxShadow outset under the New Architecture. Never mix with `elevation`; the border stays crisp if the shadow is missing.
   - Web (RNW 0.21): CSS box-shadow; overflow:auto clips the same way, so the same bleed applies.
5. **Cohesive post pane** (board 02): one Card with the pinned composer.

**Detailed-form cut-off** (`app/groups/[id]/detailed-workout.tsx`), fixed by T4 + bleed + background:
- (a) no TwoPane branch: the 600pt column straddles the crease (≈135-734pt vs ≈476)
- (b) the header sits outside the ScrollView, so the first card is sliced under the divider
- (c) the outer SafeAreaView top+bottom shows a ≈34pt cream band cutting the last card
- (d) paddingHorizontal 12 vs header 24 misalign
- (e) the screen is white instead of `background`

## 6. Rep in bug: "+ Rep in" pill shows with the strip present

**Where:** `ui/rep-in-pill.tsx`, `ui/vertical-bar-edge.tsx` and `ui/tab-root-stack.tsx` are identical on main and on PR #10. PR #10 changes only reserved-regions/layout files. So the bug ships on both.

**Hide logic today** (`ui/rep-in-pill.tsx`, branch line 38 / main :36):
```
const stripPresent = edge !== null;            // edge = useVerticalBarEdge()
if (!focused || stripPresent || !session || !selectedGroupId || keyboardVisible) return null;
```
There is no width threshold and no platform check in this logic. Its only strip signal is `edge`.

**Cause (from code; root cause, pending device confirmation):**
1. `useVerticalBarEdge()` (`ui/vertical-bar-edge.tsx:27-39`) keeps **per-instance** state, starting at `useState(null)`. Each instance adds its own `ExpoStatusBar` listener and only learns the edge from an event.
2. In expo-status-bar 58.0.4 (lockfile; source read at `expo/expo` branch `sdk-58`, `packages/expo-status-bar/ios/StatusBarModule.swift:34-67`), the **current edge is sent once**, from `OnStartObserving`. Expo calls that only when the listener count goes 0 → 1. After that, events are sent only on a trait **change**.
   - If `SceneGeometry.keyWindow()` is nil at that moment, it returns without registering or sending anything (`guard … let window` :50-54). Nothing retries until the count drops back to 0.
3. Instances that mount **after** that first event therefore stay `null` until the next fold or edge change. The first instances are the tab-root `TabRootStack`s, which draw the strip (+), and Home's screen.
   - Community's `RepInPill` mounts later: it is rendered at `community/index.tsx:507` and `:698`, i.e. in branches that appear after data loads.
   - Profile's (`profile/index.tsx:197`) mounts on first visit.
   - For them `stripPresent` is false, so the pill renders **while the strip (+) is visible**.

   This matches Josue's screenshots: Community shows both the (+) and the pill, and Home (mounted in the first batch) shows no pill.
4. The same stale-null affects `CommunityFeed`'s bottom padding (`ui/components.tsx:493-494`: 132 instead of insets.bottom + xxl) and Home's `verticalBarEdge` (`(home)/index.tsx:34`) when they mount late.

**Fix: exact spec** (PR 0, `ui/vertical-bar-edge.tsx` only plus its callers):
- **One app-wide store, not per-hook state.** Module-level `{ status: "unsupported" | "pending" | "known", edge: "leading" | "trailing" | null }`. The hook reads it with `useSyncExternalStore`, so a late mount reads the cached value immediately.
- **Initialisation (once):**
  - `status = "unsupported"`, `edge = null` when `Platform.OS !== "ios"`, or `requireOptionalNativeModule("ExpoStatusBar")` is null, or the iOS version is below 27.1 (`parseFloat(String(Platform.Version)) < 27.1`; the native code only observes on 27.1+).
  - Otherwise `status = "pending"`, and add **one** listener that is never removed while the app runs.
  - Each event sets `edge` to `"leading"`/`"trailing"`, or null for anything else, and sets `status = "known"`.
- **Missed-first-event retry:** if still `pending` 1000 ms after subscribing, or when `AppState` becomes `active` while pending, remove the listener and add it again. That takes the count to 0 → 1, which re-runs `OnStartObserving` and resends the edge. After 2 retries with no event, set `status = "known"`, `edge = null`.
- **Never call** `getVerticalBarEdge()`. It is synchronous with `EXUtilities.performSynchronously` and is the 0x8BADF00D deadlock path noted in the file header.
- **Derived values:**
  - `stripPresent = status === "known" && edge !== null`
  - `edgeResolved = status !== "pending"`
- **Hotfix condition** for the pill until PR 5 removes it: render only if
  `focused && edgeResolved && !stripPresent && session && selectedGroupId && !keyboardVisible`.
  While pending, it renders nothing (no flash on Duo).
- **TabRootStack (final, D2):**
  - `headerShown: edgeResolved`
  - Toolbar (+) when `edgeResolved && session && selectedGroupId`, whether or not the strip is present: the system places it in the strip or in the top bar
  - Before PR 5, keep today's `headerShown: stripPresent`
- **Tests:** a unit test for the store (pending → known; a late subscriber gets the cached edge; retry on pending; unsupported on non-iOS or < 27.1). Device checks are QA-R1-R4.

## 7. Implementation plan (PR-sized; **Studio estimates, for Dev to confirm**)

| PR | Scope | Depends on | Est. |
|---|---|---|---|
| 0 | Rep in bug: shared edge store + hotfix condition (§6). Can land on main and on top of PR #10. | — | 0.5 d + device check |
| 1 | Tokens: colour merge (§2.1), new colours, radii remap (§2.3), type additions (§2.2), elevation tokens. Value-preserving. | — | 0.5–1 d |
| 2 | Card + elevation + 12pt bleed in PaneScroll / feedViewport; delete old shadow styles | 1 | 1–1.5 d |
| 3 | Primitives: RoundIconButton, SegmentedControl, ListRow, Button variants, icon chevrons; delete text BackButton | 1 | 1.5–2 d |
| 4 | Form fields: TextField states, NumberField, FlameRating, PhotoTile, ChoiceTile, DateRow | 3 | 2 d |
| 5 | Rep in final (D2): header (+) on tab roots, web header (+), delete RepInPill, tab label "Profile", one web icon set | 0, 3 | 1 d |
| 6 | Workout forms T4 as modal with X (D3); detailed cut-off fixes; no-strip fallback | 2, 3, 4 | 3–4 d |
| 7 | Community post pane + pinned composer; post modal header; photo viewer X; workouts/[sessionId] | 2, 3 | 2–3 d |
| 8 | Home cleanup (icons, tokens, Highlights card) | 2 | 0.5–1 d |
| 9 | T1 screens: signup, forgot, reset, onboarding/groups | 3, 4 | 1.5–2 d |
| 10 | T2/T3 screens: settings, create-group, join-group, groups/join, join/[code], profile, group detail | 3, 4 | 2–3 d |
| 11 | Sheets, date picker, menus, StateCard | 3 | 1 d |
| 12 | Literal sweep (fontSize/minHeight/borderRadius) + lint guard against new literals | all | 1 d |
| — | On-device QA pass on a TestFlight build (§8) | all | 1 d |

**Total ≈ 17–23 dev days** (Studio estimate). Order: PR 0 first (bug), then 1 → 2/3 → the rest. PRs 7-11 can run in parallel once 3 lands.

## 8. QA checklist

**Rep in bug (PR 0), Duo unfolded, TestFlight:**
- [ ] R1 Cold launch on Home, then open Community: no "+ Rep in" pill; the strip (+) is visible.
- [ ] R2 Same for Profile on first visit, and after a Community data reload.
- [ ] R3 Folded (no strip): the pill (before PR 5) or the top-bar (+) (after PR 5) is visible on all three tab roots; no flash of the pill when unfolding.
- [ ] R4 Regular iPhone on iOS < 27.1 and ≥ 27.1: Rep in is reachable. Android/web are unchanged.
- [ ] R5 Optional confirmation of the cause on today's build: on Community with the pill showing, fold and unfold once. If the pill disappears (an edge-change event arrived), the cause is confirmed.

**Design:**
- [ ] Every card: white, 1pt border, r14, e1; no clipped shadows at pane edges (Home, Community, group detail) on iOS, Android 9+, web.
- [ ] No pressable under 44pt; no text glyph icons; no literal fontSize, minHeight or radius (lint).
- [ ] Form modals and sheets: X top-left (strip and no strip, D7); preview row + sticky submit on compact; the detailed form shows no cut-off at top, bottom or crease.
- [ ] Field states (default/focus/filled/error/disabled) match board 10; VoiceOver reads errors (live region) and flame rating (radio group).
- [ ] Post pane / modal / deep link: one surface, composer pinned and above the keyboard.
- [ ] Tab label reads "Profile" (native + web).
- [ ] Every non-tab screen on Duo unfolded: nothing straddles the crease.

**On-device checks carried over from the proposal (§9):**
- [ ] D1 Does an RN `Modal` (photo viewer, post modal, now also the form modals) draw under the strip, or does the strip stay on top? Where does the X land?
- [ ] D2 On root-stack routes (settings, groups/[id], workouts/[sessionId], auth, onboarding), is the strip area still reserved (`ReservedRegionsProvider`)? Is the round ‹ placement correct?
- [ ] D3 `groups/[id]` ScrollView `overflow:"visible"` (`ui/components.tsx:129`): does it actually un-clip on iOS Fabric? (The bleed makes this moot if it does not.)
- [ ] D4 Android 9+ boxShadow rendering.
- [ ] D5 Does the iOS 26/27 Toolbar "plus" render identically in the top bar (no strip) and in the strip?
- [ ] PR #10's own fold checklist (fold/unfold 10+ times on Home, Community, Post a workout) still passes with PR 0.

## 9. Still unverified

- The Rep in cause is from code, not observed on device. QA-R5 confirms it.
- The expo-status-bar native source was read from `expo/expo` branch `sdk-58`, not from the exact `58.0.4` tag.
- D1-D5 above.
- Whether the strip stays visible while a form modal is up. The X no longer depends on it: it is top-left either way (D7).
- "Before (from code)" panels are reconstructed from main's style values. Josue's 4 screenshots are unmodified.
- All estimates are Studio estimates.
