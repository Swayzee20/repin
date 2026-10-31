# Agent notes

## Design language

[docs/DESIGN-LANGUAGE.md](docs/DESIGN-LANGUAGE.md) is final, approved by Josue on Oct 31, 2026, and the reference for all future work. Boards are in [docs/design/](docs/design/). The same rules are in `.cursor/rules/design-language.mdc`.

- New screens and features must use the tokens in `apps/mobile/ui/theme.ts` and the shared components per `docs/DESIGN-LANGUAGE.md`.
- No literal colours, `fontSize`, `borderRadius`, shadows, or sub-44pt pressables.
- Use the pane templates T1–T4 via `TwoPane` / `useLayoutMode`.
- The side-strip nav pill and the round orange (+) are locked.
- Never call `ExpoStatusBar.getVerticalBarEdge` (deadlock). Read strip state from the shared store in `apps/mobile/ui/vertical-bar-edge.tsx`.
