/**
 * Disallow numeric fontSize, minHeight, and borderRadius literals in style
 * objects. Design steps live in apps/mobile/ui/theme.ts (the only file this
 * rule skips). Pair a kept literal with an eslint-disable comment.
 *
 * Verify: node --test eslint/no-style-literals.test.mjs
 * The ignored fixture apps/mobile/ui/style-literal-violation.fixture.tsx fails
 * `pnpm exec eslint --no-ignore` on that path.
 */

const PROPERTIES = new Set(["fontSize", "minHeight", "borderRadius"]);

const WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "ParenthesizedExpression",
  "ChainExpression",
]);

function isTokensFile(filename) {
  return filename.replaceAll("\\", "/").endsWith("apps/mobile/ui/theme.ts");
}

function propertyName(key) {
  if (!key) return null;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}

function numericLiteral(node) {
  let current = node;
  while (current && WRAPPERS.has(current.type)) current = current.expression;
  if (current && current.type === "Literal" && typeof current.value === "number") return current;
  return null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow numeric fontSize, minHeight, and borderRadius literals outside the design tokens file.",
    },
    schema: [],
    messages: {
      literal:
        "Use a design token for {{prop}} instead of the numeric literal {{value}}. Literals for this property belong in apps/mobile/ui/theme.ts.",
    },
  },
  create(context) {
    if (isTokensFile(context.filename ?? "")) return {};

    function report(prop, literal) {
      context.report({
        node: literal,
        messageId: "literal",
        data: { prop, value: String(literal.value) },
      });
    }

    return {
      Property(node) {
        const name = propertyName(node.key);
        if (!PROPERTIES.has(name)) return;
        const literal = numericLiteral(node.value);
        if (literal) report(name, literal);
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || !PROPERTIES.has(node.name.name)) return;
        const value = node.value;
        if (!value || value.type !== "JSXExpressionContainer") return;
        const literal = numericLiteral(value.expression);
        if (literal) report(node.name.name, literal);
      },
    };
  },
};

export default rule;
