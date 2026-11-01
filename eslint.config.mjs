import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import noStyleLiterals from "./eslint/no-style-literals.mjs";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.expo/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "apps/api/next-env.d.ts",
      // Failure fixture for repin/no-style-literals. Lint it with --no-ignore.
      "apps/mobile/ui/style-literal-violation.fixture.tsx",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      repin: {
        rules: {
          "no-style-literals": noStyleLiterals,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "repin/no-style-literals": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { "prefer": "type-imports" }
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { "checksVoidReturn": { "attributes": false } }
      ]
    },
  },
  {
    files: ["apps/mobile/ui/theme.ts"],
    rules: {
      "repin/no-style-literals": "off",
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
);
