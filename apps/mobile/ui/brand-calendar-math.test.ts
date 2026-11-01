import assert from "node:assert/strict";
import { test } from "node:test";

/* eslint-disable @typescript-eslint/no-floating-promises */

import {
  WEEKDAY_LABELS,
  dayAccessibilityLabel,
  dayMarkAppearance,
  dayMarkRing,
  dayMarkSize,
  monthArrowState,
  monthMatrix,
  monthTitle,
  shiftMonth,
  weekdayRowHeight,
} from "./brand-calendar-math";
import { colors, size, spacing, type } from "./theme";

function cell(year: number, month: number, day: number, maximumKey: string, todayKey: string, selectedKey: string) {
  const found = monthMatrix({ maximumKey, month, selectedKey, todayKey, year })
    .flat()
    .find((item) => item.inMonth && item.date?.getDate() === day);
  assert.ok(found);
  return found;
}

test("October 2026 starts Thursday and lays out in 5 Sunday-first weeks", () => {
  const weeks = monthMatrix({
    maximumKey: "2026-10-31",
    month: 9,
    selectedKey: "2026-10-31",
    todayKey: "2026-10-31",
    year: 2026,
  });
  assert.equal(weeks.length, 5);
  assert.equal(weeks.every((week) => week.length === 7), true);
  assert.deepEqual(WEEKDAY_LABELS, ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);
  assert.equal(weeks[0]?.[0]?.inMonth, false);
  assert.equal(weeks[0]?.[3]?.inMonth, false);
  assert.equal(weeks[0]?.[4]?.inMonth, true);
  assert.equal(weeks[0]?.[4]?.date?.getDate(), 1);
  assert.equal(weeks[0]?.[4]?.date?.getDay(), 4);
  assert.equal(weeks[0]?.[6]?.date?.getDate(), 3);
  assert.equal(weeks[4]?.[6]?.inMonth, true);
  assert.equal(weeks[4]?.[6]?.date?.getDate(), 31);
  assert.equal(weeks[4]?.[6]?.date?.getDay(), 6);
  assert.equal(weeks[4]?.[6]?.selected, true);
  assert.equal(weeks[4]?.[6]?.today, true);
});

test("August 2026 has 6 weeks", () => {
  const weeks = monthMatrix({
    maximumKey: "2026-10-31",
    month: 7,
    selectedKey: "2026-08-01",
    todayKey: "2026-10-31",
    year: 2026,
  });
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0]?.[5]?.inMonth, false);
  assert.equal(weeks[0]?.[6]?.inMonth, true);
  assert.equal(weeks[0]?.[6]?.date?.getDate(), 1);
  assert.equal(weeks[0]?.[6]?.date?.getDay(), 6);
  assert.equal(weeks[5]?.[0]?.date?.getDate(), 30);
  assert.equal(weeks[5]?.[1]?.date?.getDate(), 31);
  assert.equal(weeks[5]?.[1]?.date?.getDay(), 1);
  assert.equal(weeks[5]?.[2]?.inMonth, false);
});

test("days after the maximum local date are disabled and today is marked by Y/M/D", () => {
  const october = {
    maximumKey: "2026-10-15",
    month: 9,
    selectedKey: "2026-10-15",
    todayKey: "2026-10-31",
    year: 2026,
  };
  const lastEnabled = cell(2026, 9, 15, october.maximumKey, october.todayKey, october.selectedKey);
  const firstDisabled = cell(2026, 9, 16, october.maximumKey, october.todayKey, october.selectedKey);
  const today = cell(2026, 9, 31, october.maximumKey, october.todayKey, october.selectedKey);
  const earlier = cell(2026, 9, 1, october.maximumKey, october.todayKey, october.selectedKey);
  assert.equal(lastEnabled.disabled, false);
  assert.equal(lastEnabled.selected, true);
  assert.equal(firstDisabled.disabled, true);
  assert.equal(firstDisabled.selected, false);
  assert.equal(today.disabled, true);
  assert.equal(today.today, true);
  assert.equal(earlier.today, false);
  assert.equal(earlier.disabled, false);
});

test("the next arrow stops on the maximum month and previous stays enabled", () => {
  const onMaximum = monthArrowState(2026, 9, "2026-10-31");
  const before = monthArrowState(2026, 8, "2026-10-31");
  const after = monthArrowState(2026, 10, "2026-10-31");
  assert.equal(onMaximum.nextDisabled, true);
  assert.equal(onMaximum.previousDisabled, false);
  assert.equal(before.nextDisabled, false);
  assert.equal(before.previousDisabled, false);
  assert.equal(after.nextDisabled, true);
  assert.equal(after.previousDisabled, false);
  assert.deepEqual(shiftMonth(2026, 0, -1), { month: 11, year: 2025 });
});

test("day labels name the full local date and month titles follow the locale", () => {
  const saturday = new Date(2026, 9, 31);
  assert.equal(dayAccessibilityLabel(saturday, false, "en-US"), "Saturday, October 31, 2026");
  assert.equal(dayAccessibilityLabel(saturday, true, "en-US"), "Saturday, October 31, 2026, today");
  assert.equal(monthTitle(2026, 9, "en-US"), "October 2026");
});

test("day marks use brand tokens and the 40pt circle, never a system blue", () => {
  const resting = dayMarkAppearance({ disabled: false, pressed: false, selected: false, today: false });
  assert.equal(resting.color, colors.ink);
  assert.equal(resting.color, "#2B211C");
  assert.equal(resting.backgroundColor, "transparent");

  const today = dayMarkAppearance({ disabled: false, pressed: false, selected: false, today: true });
  assert.equal(today.color, colors.brand);
  assert.equal(today.borderColor, colors.brand);
  assert.equal(today.backgroundColor, "transparent");
  assert.equal(today.emphasis, true);

  const selected = dayMarkAppearance({ disabled: false, pressed: false, selected: true, today: false });
  assert.equal(selected.backgroundColor, colors.brand);
  assert.equal(selected.color, colors.surface);
  assert.equal(selected.borderColor, "transparent");

  const todaySelected = dayMarkAppearance({ disabled: false, pressed: false, selected: true, today: true });
  assert.equal(todaySelected.backgroundColor, colors.brand);
  assert.equal(todaySelected.borderColor, "transparent");
  assert.equal(todaySelected.color, colors.surface);

  const pressed = dayMarkAppearance({ disabled: false, pressed: true, selected: false, today: false });
  assert.equal(pressed.backgroundColor, colors.selection);

  const pressedToday = dayMarkAppearance({ disabled: false, pressed: true, selected: false, today: true });
  assert.equal(pressedToday.backgroundColor, colors.selection);
  assert.equal(pressedToday.borderColor, colors.brand);

  const pressedSelected = dayMarkAppearance({ disabled: false, pressed: true, selected: true, today: false });
  assert.equal(pressedSelected.backgroundColor, colors.brandPressed);

  const disabled = dayMarkAppearance({ disabled: true, pressed: true, selected: false, today: false });
  assert.equal(disabled.color, colors.disabledText);
  assert.equal(disabled.backgroundColor, "transparent");

  assert.equal(dayMarkSize, spacing.huge);
  assert.equal(dayMarkSize, 40);
  assert.equal(dayMarkRing, 1.5);
  assert.equal(weekdayRowHeight, type.calendarWeekday.lineHeight);
  assert.equal(weekdayRowHeight, 18);
  assert.equal(size.hit, 44);
});
