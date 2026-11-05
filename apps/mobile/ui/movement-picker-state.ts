import type { MovementSummary } from "@repin/types";

import { fonts, radii, type } from "./theme";

export const movementSearchDebounceMs = 250;
export const movementSearchMinChars = 2;
export const movementSearchLimit = 8;
export const recentSectionLimit = 8;
export const typedMovementNameMax = 160;
export const movementSearchQueryMax = 100;

export const pickerTitle = "Add exercises";
export const pickerSearchPlaceholder = "Search movements";
export const typedNameHelper =
  "Not in the list? Use the name as you typed it. Names you've used show up here next time.";

export const pickerSectionLabels = {
  all: "ALL MOVEMENTS",
  movements: "MOVEMENTS",
  recent: "RECENT",
  used: "YOU'VE USED",
} as const;

export const pickerSearchRadius = radii.lg;
export const pickerChipRadius = radii.sm;
export const pickerChipType = {
  fontFamily: fonts.bold,
  fontSize: type.calendarWeekday.fontSize,
  lineHeight: type.calendarWeekday.lineHeight,
} as const;

export type MovementMeasure = "cal" | "m" | "reps" | "sec";

export type PickerMovement = {
  category: string | null;
  custom: boolean;
  defaultMeasure: MovementMeasure;
  equipment: string | null;
  key: string;
  lastUsedAt: string | null;
  movementId: string | null;
  movementName: string;
};

export type MovementsApiBody = {
  movements?: Array<MovementSummary & { occurredAt?: string | null }>;
  recent?: Array<MovementSummary & { occurredAt?: string | null }>;
  recentCustom?: Array<{ name: string; occurredAt?: string | null }>;
};

export type PickerListModel = {
  all: PickerMovement[];
  catalogMatches: PickerMovement[];
  query: string;
  recent: PickerMovement[];
  searching: boolean;
  showUseAsTyped: boolean;
  usedMatches: PickerMovement[];
};

/**
 * App-side default measure for catalog names (starter list). Typed names
 * always default to reps. Keyed by lowercase name because GET /api/movements
 * does not return slug or default_measure.
 */
const catalogDefaultMeasureByName: Record<string, MovementMeasure> = {
  "air bike": "cal",
  "bike erg": "cal",
  "farmer's carry": "m",
  "farmer’s carry": "m",
  "handstand hold": "sec",
  "handstand walk": "m",
  "hollow hold": "sec",
  "l-sit": "sec",
  "overhead carry": "m",
  plank: "sec",
  rower: "cal",
  run: "m",
  "sandbag carry": "m",
  "shuttle run": "m",
  "side plank": "sec",
  "ski erg": "cal",
  "sled pull": "m",
  "sled push": "m",
  "suitcase carry": "m",
  swim: "m",
};

export function normalizeTypedMovementName(raw: string) {
  return raw.trim().replace(/\s+/g, " ").slice(0, typedMovementNameMax);
}

export function movementPickerKey(movement: { movementId: string | null; movementName: string }) {
  if (movement.movementId) return `catalog:${movement.movementId}`;
  return `custom:${normalizeTypedMovementName(movement.movementName).toLowerCase()}`;
}

export function defaultMeasureForMovement(name: string, custom = false): MovementMeasure {
  if (custom) return "reps";
  return catalogDefaultMeasureByName[normalizeTypedMovementName(name).toLowerCase()] ?? "reps";
}

export function movementSearchQuery(raw: string) {
  const query = raw.trim();
  if (query.length < movementSearchMinChars) return null;
  return query.slice(0, movementSearchQueryMax);
}

export function catalogFromSummary(
  movement: MovementSummary & { occurredAt?: string | null },
): PickerMovement {
  return {
    category: movement.category,
    custom: false,
    defaultMeasure: defaultMeasureForMovement(movement.name),
    equipment: movement.equipment,
    key: `catalog:${movement.id}`,
    lastUsedAt: movement.occurredAt ?? null,
    movementId: movement.id,
    movementName: movement.name,
  };
}

export function customFromName(name: string, occurredAt?: string | null): PickerMovement | null {
  const movementName = normalizeTypedMovementName(name);
  if (!movementName) return null;
  return {
    category: null,
    custom: true,
    defaultMeasure: "reps",
    equipment: null,
    key: `custom:${movementName.toLowerCase()}`,
    lastUsedAt: occurredAt ?? null,
    movementId: null,
    movementName,
  };
}

export function typedMovementFromQuery(query: string) {
  return customFromName(query);
}

export function pickerMovementFromDraft(input: {
  defaultMeasure?: MovementMeasure;
  equipment: string | null;
  movementId: string | null;
  movementName: string;
}): PickerMovement {
  if (input.movementId) {
    return {
      ...catalogFromSummary({
        category: null,
        equipment: input.equipment,
        id: input.movementId,
        name: input.movementName,
      }),
      defaultMeasure: input.defaultMeasure ?? defaultMeasureForMovement(input.movementName),
    };
  }
  const custom = customFromName(input.movementName);
  return {
    category: null,
    custom: true,
    defaultMeasure: input.defaultMeasure ?? "reps",
    equipment: input.equipment,
    key: custom?.key ?? movementPickerKey(input),
    lastUsedAt: null,
    movementId: null,
    movementName: custom?.movementName ?? input.movementName,
  };
}

export function parseMovementsResponse(body: MovementsApiBody | null | undefined) {
  const catalog = (body?.movements ?? []).map(catalogFromSummary);
  const recent = (body?.recent ?? []).map(catalogFromSummary);
  const recentCustom = (body?.recentCustom ?? []).flatMap((item) => {
    const custom = customFromName(item.name, item.occurredAt);
    return custom ? [custom] : [];
  });
  return { catalog, recent, recentCustom };
}

export function mergeRecentSection(
  catalog: PickerMovement[],
  custom: PickerMovement[],
  limit = recentSectionLimit,
) {
  const items = [...catalog, ...custom];
  if (items.length && items.every((item) => item.lastUsedAt)) {
    items.sort((left, right) => (right.lastUsedAt ?? "").localeCompare(left.lastUsedAt ?? ""));
  }
  const seen = new Set<string>();
  const next: PickerMovement[] = [];
  for (const item of items) {
    const nameKey = normalizeTypedMovementName(item.movementName).toLowerCase();
    if (!nameKey || seen.has(item.key) || seen.has(nameKey)) continue;
    seen.add(item.key);
    seen.add(nameKey);
    next.push(item);
    if (next.length >= limit) break;
  }
  return next;
}

export function filterMovementsByQuery(rows: PickerMovement[], query: string) {
  const needle = normalizeTypedMovementName(query).toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => normalizeTypedMovementName(row.movementName).toLowerCase().includes(needle));
}

export function hasExactMovementMatch(query: string, rows: PickerMovement[]) {
  const needle = normalizeTypedMovementName(query).toLowerCase();
  if (!needle) return true;
  return rows.some((row) => normalizeTypedMovementName(row.movementName).toLowerCase() === needle);
}

export function showsUseAsTyped(query: string, rows: PickerMovement[]) {
  if (!movementSearchQuery(query)) return false;
  return !hasExactMovementMatch(query, rows);
}

export function formatUseAsTypedLabel(query: string) {
  const name = normalizeTypedMovementName(query);
  return `Use \u201c${name}\u201d as typed`;
}

export function addExercisesLabel(count: number) {
  if (count <= 0) return "Add exercises";
  if (count === 1) return "Add 1 exercise";
  return `Add ${count} exercises`;
}

export function togglePickerSelection(selected: PickerMovement[], row: PickerMovement) {
  if (selected.some((item) => item.key === row.key)) {
    return selected.filter((item) => item.key !== row.key);
  }
  return [...selected, row];
}

export function isPickerSelected(selected: PickerMovement[], key: string) {
  return selected.some((item) => item.key === key);
}

export function formatLastUsed(iso: string | null | undefined, now = new Date()) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : "";
  return `last ${month} ${date.getDate()}${year}`;
}

function measureMetaLabel(measure: MovementMeasure) {
  if (measure === "cal") return "calories";
  if (measure === "m") return "meters";
  if (measure === "sec") return "time";
  return null;
}

export function formatPickerMeta(row: PickerMovement, section: "catalog" | "recent") {
  const parts: string[] = [];
  if (row.custom) parts.push("Typed by you");
  else if (row.equipment) parts.push(row.equipment);
  else if (row.category) parts.push(row.category);
  if (section === "recent") {
    const last = formatLastUsed(row.lastUsedAt);
    if (last) parts.push(last);
  } else if (!row.custom) {
    const measure = measureMetaLabel(row.defaultMeasure);
    if (measure) parts.push(measure);
  }
  return parts.join(" · ");
}

export function pickerListModel({
  catalog,
  query,
  recentCatalog,
  recentCustom,
  searchResults,
}: {
  catalog: PickerMovement[];
  query: string;
  recentCatalog: PickerMovement[];
  recentCustom: PickerMovement[];
  searchResults: PickerMovement[];
}): PickerListModel {
  const searching = Boolean(movementSearchQuery(query));
  const usedMatches = searching ? filterMovementsByQuery(recentCustom, query) : [];
  const catalogMatches = searching ? searchResults.slice(0, movementSearchLimit) : [];
  const matchRows = [...catalogMatches, ...usedMatches];
  return {
    all: searching ? [] : catalog.slice(0, movementSearchLimit),
    catalogMatches,
    query,
    recent: searching ? [] : mergeRecentSection(recentCatalog, recentCustom),
    searching,
    showUseAsTyped: showsUseAsTyped(query, matchRows),
    usedMatches,
  };
}
