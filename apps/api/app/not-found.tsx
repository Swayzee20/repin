import { colors, spacing, type } from "../lib/theme";

export default function NotFound() {
  return (
    <main
      style={{
        background: colors.background,
        color: colors.ink,
        fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif",
        minHeight: "100vh",
        padding: spacing.huge,
      }}
    >
      <h1
        style={{
          fontFamily: "Fredoka, Nunito, sans-serif",
          fontSize: type.title.fontSize,
          letterSpacing: type.title.letterSpacing,
          lineHeight: type.title.lineHeight,
          margin: 0,
        }}
      >
        This page isn&apos;t available
      </h1>
      <p
        style={{
          color: colors.muted,
          fontSize: type.body.fontSize,
          lineHeight: type.body.lineHeight,
          marginTop: spacing.lg,
        }}
      >
        Check the link or go back to repin.
      </p>
    </main>
  );
}
