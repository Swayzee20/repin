export const colors = {
  background: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceMuted: "#F4F0EE",
  ink: "#222222",
  inkSoft: "#3A3A3A",
  muted: "#777777",
  subtle: "#999999",
  border: "#E9E2DF",
  borderStrong: "#D9CFCC",
  brand: "#E85D5D",
  brandPressed: "#C94A4A",
  brandSoft: "#FBEAEA",
  success: "#4FAF83",
  successSoft: "#EAF6F1",
  achievement: "#E7A93B",
  warning: "#E7A93B",
  warningSoft: "#FFF4DE",
  danger: "#C94A4A",
  dangerSoft: "#FBEAEA",
  board: "#FBEAEA",
  boardBorder: "#F2CCCC",
  boardTransparent: "rgba(251,234,234,0)",
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
  shadowColor: "#101318",
  shadowOffset: { height: 4, width: 0 },
  shadowOpacity: 0.12,
  shadowRadius: 10,
} as const;

export const compactSelectorShadowStyle = {
  elevation: 2,
  shadowColor: "#101318",
  shadowOffset: { height: 2, width: 0 },
  shadowOpacity: 0.09,
  shadowRadius: 6,
} as const;

export const compactControlShadowStyle = {
  elevation: 1,
  shadowColor: "#101318",
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
