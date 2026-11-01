/**
 * Failure fixture for `repin/no-style-literals`.
 *
 * `pnpm lint` ignores this file so the suite stays green. Prove the guard with:
 *
 *   pnpm exec eslint --no-ignore apps/mobile/ui/style-literal-violation.fixture.tsx
 *
 * That command must fail on the numeric fontSize, minHeight, and borderRadius.
 */
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  title: { fontSize: 16 },
  row: { minHeight: 40 },
  card: { borderRadius: 8 },
});
