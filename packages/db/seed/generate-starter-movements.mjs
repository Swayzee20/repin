import { readFileSync, writeFileSync } from "node:fs";

import {
  csvPath,
  generateStarterMovementsSql,
  parseCsv,
  sqlPath,
} from "./starter-movements.mjs";

const rows = parseCsv(readFileSync(csvPath, "utf8"));
writeFileSync(sqlPath, generateStarterMovementsSql(rows));
console.log(`Wrote ${rows.length} movements to ${sqlPath}`);
