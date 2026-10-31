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
  brandTint: "#FFF1E6",
  selection: "#EBE7E1",
  glassFill: "#FFFBF6",
  glassEdge: "#ECE3DB",
  disabledFill: "#EFE5DC",
  disabledText: "#8C7B70",
  success: "#2E7D5B",
  successSoft: "#EAF6F1",
  warningSoft: "#FFF4DE",
  danger: "#B42318",
  dangerSoft: "#FDECEA",
  boardBorder: "#F6E3D6",
  boardTransparent: "rgba(255,247,240,0)",
  accent: "#F5B83D",
  accentCoral: "#F28C6B",
  feedFade: "rgba(255,247,240,0.58)",
  feedFadeSoft: "rgba(255,247,240,0.54)",
  overlay: "rgba(43,33,28,0.28)",
  overlaySoft: "rgba(43,33,28,0.16)",
  overlayStrong: "rgba(43,33,28,0.72)",
  overlayLine: "rgba(43,33,28,0.32)",
  scrimPhoto: "rgba(18,18,18,0.88)",
  photoFill: "rgba(18,18,18,0.66)",
  photoRing: "rgba(255,255,255,0.35)",
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

export const layout = {
  compactMax: 600,
  twoPaneMin: 760,
  paneMin: 320,
  maxReadable: 600,
  formMax: 420,
  margin: spacing.xxl,
  paneGutter: spacing.xl,
  foldClearance: spacing.md,
} as const;

export const radii = { sm: 8, md: 10, lg: 14, pill: 999 } as const;

export const elevation = {
  e1: "0 2px 8px rgba(43,33,28,.06)",
  e2: "0 6px 20px rgba(43,33,28,.12)",
  e3: "0 16px 40px rgba(43,33,28,.18)",
  glass: "0 3px 10px rgba(43,33,28,.10)",
} as const;

export const size = {
  hit: 44,
  control: 48,
  primary: 52,
  iconButton: 36,
  avatars: {
    xs: 24,
    sm: 36,
    md: 44,
    lg: 64,
  },
  icon: {
    md: 20,
    sm: 16,
  },
} as const;

export const controls = {
  buttonHeight: 52,
  inputHeight: 50,
} as const;

export const fonts = {
  regular: "Nunito_400Regular",
  medium: "Nunito_500Medium",
  semibold: "Nunito_600SemiBold",
  bold: "Nunito_700Bold",
  extrabold: "Nunito_800ExtraBold",
  display: "Fredoka_700Bold",
} as const;

export const type = {
  display: { fontFamily: fonts.display, fontSize: 32, letterSpacing: -0.64, lineHeight: 39 },
  screenTitle: { fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.52, lineHeight: 33 },
  title: { fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.44, lineHeight: 29 },
  heading: { fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.38, lineHeight: 25 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 25 },
  section: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 23 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  eyebrow: { fontFamily: fonts.extrabold, fontSize: 13, letterSpacing: 1.1, lineHeight: 18 },
  micro: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
  button: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 20 },
} as const;
