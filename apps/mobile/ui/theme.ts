export const colors = {
  background: "#FFFAF4",
  surface: "#FFFFFF",
  surfaceMuted: "#FFF7F0",
  ink: "#2B211C",
  inkSoft: "#4A3B33",
  muted: "#6B5B52",
  subtle: "#7A6A61",
  border: "#F0E4DA",
  borderStrong: "#E3D5CB",
  brand: "#C94300",
  brandPressed: "#9E3500",
  brandSoft: "#FFF7F0",
  success: "#2E7D5B",
  successSoft: "#EAF6F1",
  achievement: "#F5B83D",
  warning: "#F5B83D",
  warningSoft: "#FFF4DE",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  board: "#FFF7F0",
  boardBorder: "#F6E3D6",
  boardTransparent: "rgba(255,247,240,0)",
  accent: "#F5B83D",
  accentCoral: "#F28C6B",
  feed: "#FFF7F0",
  feedFade: "rgba(255,247,240,0.58)",
  feedFadeSoft: "rgba(255,247,240,0.54)",
  overlay: "rgba(43,33,28,0.28)",
  overlaySoft: "rgba(43,33,28,0.16)",
  overlayStrong: "rgba(43,33,28,0.72)",
  overlayLine: "rgba(43,33,28,0.32)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = { sm: 8, input: 9, md: 10, lg: 14, xl: 18, pill: 999 } as const;

export const floatingSurfaceStyle = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderRadius: radii.lg,
  borderWidth: 1,
  elevation: 2,
  shadowColor: colors.ink,
  shadowOffset: { height: 4, width: 0 },
  shadowOpacity: 0.12,
  shadowRadius: 10,
} as const;

export const compactSelectorShadowStyle = {
  elevation: 2,
  shadowColor: colors.ink,
  shadowOffset: { height: 2, width: 0 },
  shadowOpacity: 0.09,
  shadowRadius: 6,
} as const;

export const compactControlShadowStyle = {
  elevation: 1,
  shadowColor: colors.ink,
  shadowOffset: { height: 1, width: 0 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
} as const;

export const controls = {
  buttonHeight: 52,
  inputHeight: 50,
} as const;

export const fonts = {
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, letterSpacing: -0.8, lineHeight: 39 },
  screenTitle: { fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.5, lineHeight: 33 },
  title: { fontFamily: fonts.bold, fontSize: 22, letterSpacing: -0.35, lineHeight: 29 },
  heading: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1.1, lineHeight: 18 },
} as const;
