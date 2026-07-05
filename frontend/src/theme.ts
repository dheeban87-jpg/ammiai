// AmmiAI design system tokens
export const colors = {
  // Backgrounds
  riceWhite: "#FBF8EF",
  surface: "#FFFFFF",
  surfaceSoft: "#F3EEDE",

  // Brand
  bananaLeaf: "#1E5631", // primary
  bananaLeafDark: "#143D22", // dark header
  bananaLeafSoft: "#2E7A47",

  // Accents & signals
  turmeric: "#E3A008", // accent
  chili: "#B5451B", // alert
  cardamom: "#7A6E42",

  // Text
  textPrimary: "#1A1D14",
  textSecondary: "#5C5E52",
  textOnPrimary: "#FBF8EF",
  textMuted: "#8A8B7E",

  // Lines
  border: "#E5E0CE",
} as const;

export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  s: 8,
  m: 14,
  l: 20,
  xl: 28,
  pill: 999,
} as const;

export const fonts = {
  // Cricket-game inspired: chunky rounded headings everywhere.
  // Baloo2 SemiBold for all standard headings, ExtraBold for hero titles.
  headingEn: "Baloo2_600SemiBold",
  headingSemi: "Baloo2_600SemiBold",
  headingBold: "Baloo2_800ExtraBold",
  bodyTa: "NotoSansTamil-Regular",
  bodyTaBold: "NotoSansTamil_700Bold",
  bodyEn: undefined, // system default for body
} as const;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;
