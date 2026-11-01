import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Linter, RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "./no-style-literals.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = resolve(root, "apps/mobile/ui/style-literal-violation.fixture.tsx");

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const tsTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

test("numeric style literals fail and token references pass", () => {
  tester.run("repin/no-style-literals", rule, {
    valid: [
      "const styles = { fontSize: type.body.fontSize, lineHeight: type.body.lineHeight };",
      "const styles = { minHeight: size.hit, borderRadius: radii.md };",
      "const styles = StyleSheet.create({ row: { minHeight: size.primary, borderRadius: radii.lg } });",
      "const textAreaMinHeight = 96; const styles = { minHeight: textAreaMinHeight };",
      "const styles = { fontSize: size, lineHeight: Math.round(size * 1.32) };",
      "const styles = { height: 40, padding: 16 };",
      {
        filename: "/workspace/apps/mobile/ui/theme.ts",
        code: "export const type = { body: { fontSize: 16, lineHeight: 23 } };",
      },
    ],
    invalid: [
      { code: "const styles = { fontSize: 16 };", errors: [{ messageId: "literal" }] },
      { code: "const styles = StyleSheet.create({ box: { minHeight: 40 } });", errors: [{ messageId: "literal" }] },
      { code: "const styles = { borderRadius: 8 };", errors: [{ messageId: "literal" }] },
      { code: "const styles = { borderRadius: 0 };", errors: [{ messageId: "literal" }] },
      {
        code: "const styles = { fontSize: 16, minHeight: 44, borderRadius: 10 };",
        errors: [{ messageId: "literal" }, { messageId: "literal" }, { messageId: "literal" }],
      },
      { code: "const view = <View minHeight={30} />;", errors: [{ messageId: "literal" }] },
    ],
  });

  tsTester.run("repin/no-style-literals", rule, {
    valid: ["const styles = { fontSize: type.body.fontSize };"],
    invalid: [
      { code: "const styles = { fontSize: 16 as const };", errors: [{ messageId: "literal" }] },
    ],
  });
});

test("an eslint-disable comment keeps a literal that cannot map", () => {
  const linter = new Linter({ configType: "flat" });
  const config = [{
    plugins: { repin: { rules: { "no-style-literals": rule } } },
    rules: { "repin/no-style-literals": "error" },
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
  }];
  const suppressed = linter.verify(
    "// eslint-disable-next-line repin/no-style-literals -- flex shrink floor, not a control size\nconst styles = { minHeight: 0 };\n",
    config,
  );
  assert.deepEqual(suppressed, []);

  const reported = linter.verify("const styles = { borderRadius: 0 };\n", config);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].messageId, "literal");
});

test("documented fixture fails project lint and tokens stay exempt", () => {
  const code = readFileSync(fixturePath, "utf8");
  tester.run("repin/no-style-literals", rule, {
    valid: [],
    invalid: [{
      filename: fixturePath,
      code,
      errors: [{ messageId: "literal" }, { messageId: "literal" }, { messageId: "literal" }],
    }],
  });

  const themeConfig = execFileSync(
    "pnpm",
    ["exec", "eslint", "--print-config", "apps/mobile/ui/theme.ts"],
    { cwd: root, encoding: "utf8" },
  );
  assert.match(themeConfig, /"repin\/no-style-literals":\s*\[\s*0\s*\]/);

  let output = "";
  let status = 0;
  try {
    output = execFileSync(
      "pnpm",
      ["exec", "eslint", "--no-ignore", "apps/mobile/ui/style-literal-violation.fixture.tsx"],
      { cwd: root, encoding: "utf8" },
    );
  } catch (error) {
    status = error.status ?? 1;
    output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
  assert.notEqual(status, 0, output);
  assert.match(output, /repin\/no-style-literals/);
  assert.match(output, /fontSize/);
  assert.match(output, /minHeight/);
  assert.match(output, /borderRadius/);
  assert.doesNotMatch(output, /project service/);
});
