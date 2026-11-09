import type { PersonalRecordKind } from "@repin/types";

export const LB_TO_KG = 0.45359237;
export const DISTANCE_SNAP_EPSILON = 0.005;

export const distancePrLaneMeters = {
  "1mi": 1_609.344,
  "5k": 5_000,
  "10k": 10_000,
  half: 21_097.5,
  marathon: 42_195,
} as const;

export const distancePrLaneLabels = {
  "1mi": "1 mi",
  "5k": "5K",
  "10k": "10K",
  half: "Half marathon",
  marathon: "Marathon",
} as const;

export type DistancePrLaneId = keyof typeof distancePrLaneMeters;

export type PrLoadUnit = "lb" | "kg";

export interface PrSessionSet {
  id: string;
  position: number;
  reps: number | null;
  load: number | null;
  loadUnit: string | null;
  durationSeconds: number | null;
  distance: number | null;
  distanceUnit: string | null;
  calories: number | null;
  completed?: boolean;
}

export interface PrSessionMovement {
  id: string;
  movementId: string | null;
  movementName: string;
  position: number;
  sets: PrSessionSet[];
}

export interface PrSessionMetric {
  metricType: string;
  numericValue: number | null;
  unit: string | null;
}

export interface PrSessionSnapshot {
  id: string;
  userId: string;
  occurredAt: Date;
  workoutType: string;
  workoutSubtype?: string | null;
  workoutFormat?: string | null;
  formatDurationSeconds?: number | null;
  timeCapSeconds?: number | null;
  scoreFinished?: boolean | null;
  scoreTimeSeconds?: number | null;
  scoreRounds?: number | null;
  scoreReps?: number | null;
  name?: string | null;
  metrics: PrSessionMetric[];
  movements: PrSessionMovement[];
}

export interface PrMetric {
  loadKg: number | null;
  durationSeconds: number | null;
  rounds: number | null;
  reps: number | null;
  finished: boolean | null;
}

export interface PrCandidate {
  kind: PersonalRecordKind;
  key: string;
  metric: PrMetric;
  displayLabel: string;
  displayValue: string;
  displayUnit: string | null;
  sourceSessionId: string;
  sourceSetId: string | null;
  occurredAt: Date;
  promptKind: "one_rep" | "for_time" | null;
}

export type PrDecision =
  | { action: "prompt"; candidate: PrCandidate }
  | { action: "quiet_baseline"; candidate: PrCandidate }
  | { action: "auto_pr"; candidate: PrCandidate; previous: PrMetric; delta: string | null }
  | { action: "none" };

export function normalizeMovementName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function movementIdentity(movementId: string | null | undefined, movementName: string) {
  if (movementId) return `id:${movementId}`;
  return `name:${normalizeMovementName(movementName)}`;
}

export function loadToKg(load: number, unit: string | null | undefined) {
  if (unit === "lb") return roundKg(load * LB_TO_KG);
  return roundKg(load);
}

export function kgToLoad(kg: number, unit: PrLoadUnit) {
  if (unit === "lb") return roundLoad(kg / LB_TO_KG);
  return roundLoad(kg);
}

export function roundKg(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export function roundLoad(value: number) {
  return Math.round(value * 10) / 10;
}

export function distanceToMeters(distance: number, unit: string | null | undefined) {
  if (unit === "km") return distance * 1_000;
  if (unit === "mi") return distance * distancePrLaneMeters["1mi"];
  return distance;
}

export function snapDistanceLane(meters: number): DistancePrLaneId | null {
  let best: { id: DistancePrLaneId; relative: number } | null = null;
  for (const [id, laneMeters] of Object.entries(distancePrLaneMeters) as Array<
    [DistancePrLaneId, number]
  >) {
    const relative = Math.abs(meters - laneMeters) / laneMeters;
    if (relative > DISTANCE_SNAP_EPSILON) continue;
    if (!best || relative < best.relative) best = { id, relative };
  }
  return best?.id ?? null;
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatLoadDisplay(kg: number, unit: PrLoadUnit) {
  const value = kgToLoad(kg, unit);
  return `${formatNumber(value)} ${unit}`;
}

export function formatHeaviestValue(kg: number, unit: PrLoadUnit) {
  return `1 × ${formatLoadDisplay(kg, unit)}`;
}

export function comparePrMetrics(kind: PersonalRecordKind, a: PrMetric, b: PrMetric) {
  switch (kind) {
    case "heaviest_single":
      return compareNullableNumber(a.loadKg, b.loadKg);
    case "distance_time":
      return compareNullableNumber(b.durationSeconds, a.durationSeconds);
    case "amrap": {
      const rounds = compareNullableNumber(a.rounds, b.rounds);
      if (rounds !== 0) return rounds;
      return compareNullableNumber(a.reps ?? 0, b.reps ?? 0);
    }
    case "for_time":
      return compareForTime(a, b);
  }
}

export function isPrImprovement(kind: PersonalRecordKind, next: PrMetric, previous: PrMetric) {
  return comparePrMetrics(kind, next, previous) > 0;
}

export function formatPrDelta(
  kind: PersonalRecordKind,
  next: PrMetric,
  previous: PrMetric,
  displayUnit: string | null,
) {
  switch (kind) {
    case "heaviest_single": {
      if (next.loadKg == null || previous.loadKg == null) return null;
      const unit: PrLoadUnit = displayUnit === "kg" ? "kg" : "lb";
      const delta = kgToLoad(next.loadKg - previous.loadKg, unit);
      if (delta === 0) return null;
      const sign = delta > 0 ? "+" : "−";
      return `${sign}${formatNumber(Math.abs(delta))} ${unit}`;
    }
    case "distance_time":
    case "for_time": {
      if (kind === "for_time" && (next.finished !== true || previous.finished !== true)) {
        return null;
      }
      if (next.durationSeconds == null || previous.durationSeconds == null) return null;
      const delta = next.durationSeconds - previous.durationSeconds;
      if (delta === 0) return null;
      const sign = delta < 0 ? "−" : "+";
      return `${sign}${Math.abs(delta)} s`;
    }
    case "amrap": {
      const roundDelta = (next.rounds ?? 0) - (previous.rounds ?? 0);
      const repDelta = (next.reps ?? 0) - (previous.reps ?? 0);
      if (roundDelta !== 0) {
        const sign = roundDelta > 0 ? "+" : "−";
        return `${sign}${Math.abs(roundDelta)} rd`;
      }
      if (repDelta !== 0) {
        const sign = repDelta > 0 ? "+" : "−";
        return `${sign}${Math.abs(repDelta)} reps`;
      }
      return null;
    }
  }
}

export function workoutFingerprint(
  movements: PrSessionMovement[],
  options: { includeDuration?: number | null } = {},
) {
  const ordered = [...movements].sort((a, b) => a.position - b.position);
  const body = {
    duration: options.includeDuration ?? null,
    movements: ordered.map((movement) => {
      const set = [...movement.sets].sort((a, b) => a.position - b.position)[0];
      return {
        identity: movementIdentity(movement.movementId, movement.movementName),
        calories: set?.calories ?? null,
        distanceM: set?.distance != null
          ? roundKg(distanceToMeters(set.distance, set.distanceUnit))
          : null,
        durationSeconds: set?.durationSeconds ?? null,
        loadKg: usableLoadKg(set?.load ?? null, set?.loadUnit ?? null),
        reps: set?.reps ?? null,
      };
    }),
  };
  return stableStringify(body);
}

export function extractPrCandidates(session: PrSessionSnapshot): PrCandidate[] {
  const strength = extractHeaviestSingles(session);
  const distance = extractDistanceTimes(session);
  const amrap = extractAmrap(session);
  const forTime = extractForTime(session);
  return [...strength, ...distance, ...amrap, ...forTime];
}

export function pickBaselineCandidate(candidates: PrCandidate[]) {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((left, right) => {
    const byTime = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (byTime !== 0) return byTime;
    return left.sourceSessionId.localeCompare(right.sourceSessionId);
  });
  let best = sorted[0];
  if (!best) return null;
  for (const candidate of sorted.slice(1)) {
    if (comparePrMetrics(candidate.kind, candidate.metric, best.metric) > 0) {
      best = candidate;
    }
  }
  return best;
}

export function decidePrAction(
  candidate: PrCandidate,
  baseline: PrMetric | null,
): PrDecision {
  if (!baseline) {
    if (candidate.promptKind) {
      return { action: "prompt", candidate };
    }
    return { action: "quiet_baseline", candidate };
  }
  if (isPrImprovement(candidate.kind, candidate.metric, baseline)) {
    return {
      action: "auto_pr",
      candidate,
      previous: baseline,
      delta: formatPrDelta(
        candidate.kind,
        candidate.metric,
        baseline,
        candidate.displayUnit,
      ),
    };
  }
  return { action: "none" };
}

export function prBadgeAccessibilityLabel(count: number) {
  return count === 1 ? "Personal record" : `${count} personal records`;
}

export function visiblePrBadgeChips<T>(badges: T[]) {
  const extra = Math.max(0, badges.length - 2);
  return {
    chips: badges.slice(0, 2),
    overflow: extra,
    accessibilityLabel: prBadgeAccessibilityLabel(badges.length),
  };
}

export function emptyPrMetric(): PrMetric {
  return {
    durationSeconds: null,
    finished: null,
    loadKg: null,
    reps: null,
    rounds: null,
  };
}

function extractHeaviestSingles(session: PrSessionSnapshot): PrCandidate[] {
  if (
    session.workoutType !== "strength_training"
    && session.workoutType !== "powerlifting"
  ) {
    return [];
  }

  const bestByKey = new Map<string, PrCandidate>();
  for (const movement of session.movements) {
    const identity = movementIdentity(movement.movementId, movement.movementName);
    const key = `hs:${identity}`;
    for (const set of movement.sets) {
      if (set.reps !== 1) continue;
      const loadKg = usableLoadKg(set.load, set.loadUnit);
      if (loadKg == null) continue;
      const unit: PrLoadUnit = set.loadUnit === "kg" ? "kg" : "lb";
      const candidate: PrCandidate = {
        kind: "heaviest_single",
        key,
        metric: { ...emptyPrMetric(), loadKg },
        displayLabel: displayMovementName(movement.movementName),
        displayValue: formatHeaviestValue(loadKg, unit),
        displayUnit: unit,
        sourceSessionId: session.id,
        sourceSetId: set.id,
        occurredAt: session.occurredAt,
        promptKind: "one_rep",
      };
      const existing = bestByKey.get(key);
      if (!existing || comparePrMetrics("heaviest_single", candidate.metric, existing.metric) > 0) {
        bestByKey.set(key, candidate);
      }
    }
  }
  return [...bestByKey.values()];
}

function extractDistanceTimes(session: PrSessionSnapshot): PrCandidate[] {
  if (
    session.workoutType !== "run"
    && session.workoutType !== "walk"
    && session.workoutType !== "cycling"
  ) {
    return [];
  }

  const distance = session.metrics.find((metric) => metric.metricType === "distance");
  const duration = session.metrics.find((metric) => metric.metricType === "duration");
  if (
    distance?.numericValue == null
    || distance.numericValue <= 0
    || duration?.numericValue == null
    || duration.numericValue <= 0
  ) {
    return [];
  }

  const meters = distanceToMeters(distance.numericValue, distance.unit);
  const lane = snapDistanceLane(meters);
  if (!lane) return [];

  const durationSeconds = Math.round(duration.numericValue);
  const label = distancePrLaneLabels[lane];
  return [{
    kind: "distance_time",
    key: `dt:${session.workoutType}:${lane}`,
    metric: { ...emptyPrMetric(), durationSeconds },
    displayLabel: label,
    displayValue: formatClock(durationSeconds),
    displayUnit: "seconds",
    sourceSessionId: session.id,
    sourceSetId: null,
    occurredAt: session.occurredAt,
    promptKind: null,
  }];
}

function extractAmrap(session: PrSessionSnapshot): PrCandidate[] {
  if (session.workoutFormat !== "amrap") return [];
  if (session.formatDurationSeconds == null || session.formatDurationSeconds <= 0) return [];
  if (session.scoreRounds == null && session.scoreReps == null) return [];
  if (!session.movements.length) return [];

  const fingerprint = workoutFingerprint(session.movements, {
    includeDuration: session.formatDurationSeconds,
  });
  const rounds = session.scoreRounds ?? 0;
  const reps = session.scoreReps ?? 0;
  return [{
    kind: "amrap",
    key: `amrap:${fingerprint}`,
    metric: { ...emptyPrMetric(), rounds, reps },
    displayLabel: session.name?.trim() || "AMRAP",
    displayValue: formatAmrapScore(rounds, reps),
    displayUnit: null,
    sourceSessionId: session.id,
    sourceSetId: null,
    occurredAt: session.occurredAt,
    promptKind: null,
  }];
}

function extractForTime(session: PrSessionSnapshot): PrCandidate[] {
  if (session.workoutFormat !== "for_time") return [];
  if (!session.movements.length) return [];
  if (session.scoreFinished == null) return [];

  const fingerprint = workoutFingerprint(session.movements);
  const finished = session.scoreFinished;
  const durationSeconds = finished ? session.scoreTimeSeconds ?? null : null;
  const reps = finished ? null : session.scoreReps ?? null;
  if (finished && durationSeconds == null) return [];
  if (!finished && reps == null) return [];

  const workoutName = session.name?.trim() || "For Time";
  return [{
    kind: "for_time",
    key: `ft:${fingerprint}`,
    metric: { ...emptyPrMetric(), durationSeconds, finished, reps },
    displayLabel: workoutName,
    displayValue: formatForTimeScore({
      finished,
      reps,
      timeCapSeconds: session.timeCapSeconds ?? null,
      timeSeconds: durationSeconds,
    }),
    displayUnit: "seconds",
    sourceSessionId: session.id,
    sourceSetId: null,
    occurredAt: session.occurredAt,
    promptKind: "for_time",
  }];
}

function formatAmrapScore(rounds: number, reps: number) {
  if (reps > 0) return `${rounds} + ${reps}`;
  return `${rounds}`;
}

function formatForTimeScore(input: {
  finished: boolean;
  reps: number | null;
  timeCapSeconds: number | null;
  timeSeconds: number | null;
}) {
  if (input.finished && input.timeSeconds != null) return formatClock(input.timeSeconds);
  if (input.reps != null) return `${input.reps} reps`;
  return "For Time";
}

function compareForTime(a: PrMetric, b: PrMetric) {
  const aFinished = a.finished === true;
  const bFinished = b.finished === true;
  if (aFinished && !bFinished) return 1;
  if (!aFinished && bFinished) return -1;
  if (aFinished && bFinished) {
    return compareNullableNumber(b.durationSeconds, a.durationSeconds);
  }
  return compareNullableNumber(a.reps, b.reps);
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function usableLoadKg(load: number | null | undefined, unit: string | null | undefined) {
  if (load == null || load <= 0) return null;
  if (unit !== "lb" && unit !== "kg") return null;
  return loadToKg(load, unit);
}

function displayMovementName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
}
