import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  csvPath,
  generateStarterMovementsSql,
  isKebabCaseSlug,
  omittedCsvColumns,
  parseCsv,
  parseSeedSql,
  seededColumns,
  sqlLiteral,
  sqlPath,
  stripSqlComments,
} from "../seed/starter-movements.mjs";

const csvText = readFileSync(csvPath, "utf8");
const sqlText = readFileSync(sqlPath, "utf8");
const csvRows = parseCsv(csvText);
const sqlRows = parseSeedSql(sqlText);

test("starter CSV has unique kebab-case slugs and required fields", () => {
  assert.equal(csvRows.length, 153);
  const slugs = csvRows.map((row) => row.slug);

  assert.equal(new Set(slugs).size, slugs.length);

  for (const row of csvRows) {
    assert.ok(row.name.trim(), `missing name for slug ${row.slug}`);
    assert.ok(row.slug.trim(), `missing slug for name ${row.name}`);
    assert.ok(row.category.trim(), `missing category for ${row.slug}`);
    assert.match(row.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(isKebabCaseSlug(row.slug), true);
    assert.equal(row.slug, row.slug.toLowerCase());
  }
});

test("seed SQL matches the CSV and stays in sync with the generator", () => {
  assert.equal(sqlText, generateStarterMovementsSql(csvRows));
  assert.equal(sqlRows.length, csvRows.length);

  for (const [index, csvRow] of csvRows.entries()) {
    assert.deepEqual(sqlRows[index], {
      name: csvRow.name,
      slug: csvRow.slug,
      category: csvRow.category,
      equipment: csvRow.equipment,
    });
  }
});

test("seed SQL uses insert on conflict (slug) do nothing", () => {
  const body = stripSqlComments(sqlText).toLowerCase();

  assert.match(
    body,
    /insert\s+into\s+public\.movements\s*\(\s*name\s*,\s*slug\s*,\s*category\s*,\s*equipment\s*\)/,
  );
  assert.match(body, /on\s+conflict\s*\(\s*slug\s*\)\s*do\s+nothing/);
  assert.doesNotMatch(body, /do\s+update/);
  assert.doesNotMatch(body, /on\s+conflict\s+do\s+update/);

  for (const column of omittedCsvColumns) {
    assert.doesNotMatch(body, new RegExp(`\\b${column}\\b`));
  }
});

test("SQL string literals escape quotes and keep commas and unicode apostrophes", () => {
  assert.equal(sqlLiteral("O'Brien"), "'O''Brien'");
  assert.deepEqual(parseSeedSql(`
insert into public.movements (name, slug, category, equipment)
values
  (${sqlLiteral("O'Brien")}, 'o-brien', 'Push', ${sqlLiteral("Dumbbell, cable")})
on conflict (slug) do nothing;
`), [
    {
      name: "O'Brien",
      slug: "o-brien",
      category: "Push",
      equipment: "Dumbbell, cable",
    },
  ]);

  const farmersCarry = sqlRows.find((row) => row.slug === "farmers-carry");
  const chestFly = sqlRows.find((row) => row.slug === "chest-fly");
  const csvFarmersCarry = csvRows.find((row) => row.slug === "farmers-carry");
  const csvChestFly = csvRows.find((row) => row.slug === "chest-fly");

  assert.equal(farmersCarry?.name, "Farmer’s Carry");
  assert.equal(farmersCarry?.name, csvFarmersCarry?.name);
  assert.equal(chestFly?.equipment, "Dumbbell, cable or machine");
  assert.equal(chestFly?.equipment, csvChestFly?.equipment);
  assert.match(sqlText, /'Farmer’s Carry'/);
  assert.match(sqlText, /'Dumbbell, cable or machine'/);
  assert.equal(sqlText.includes(seededColumns.join(", ")), true);
});
