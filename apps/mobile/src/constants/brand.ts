/**
 * Wasil is deliberately distinct from the high-chroma orange/yellow identities
 * common in the delivery space: warm date-coral, plum ink, and mint delivery
 * cues make it feel local, premium, and easy to scan.
 */
export const brand = {
  name: "Wasil",
  tagline: "Your city, delivered.",
  colors: {
    light: {
      primary: "#F2552C",
      primaryPressed: "#D9411C",
      primarySoft: "#FFF0EA",
      primaryText: "#8A321D",
      accent: "#F6B93B",
      mint: "#16856B",
      ink: "#25192A",
      inkMuted: "#756C78",
      canvas: "#FFF8F4",
      surface: "#FFFFFF",
      surfaceMuted: "#FFF4EE",
      border: "#F1E4DE",
      danger: "#C83A4B",
      warning: "#C77A00",
    },
    dark: {
      primary: "#FF7551",
      primaryPressed: "#F2552C",
      primarySoft: "#42211E",
      primaryText: "#FFB09D",
      accent: "#F6C65B",
      mint: "#62C7AE",
      ink: "#FFF7F3",
      inkMuted: "#CDBFC3",
      canvas: "#171019",
      surface: "#25192A",
      surfaceMuted: "#32212E",
      border: "#4A3544",
      danger: "#FF8391",
      warning: "#F6C65B",
    },
  },
  radius: {
    small: 12,
    medium: 18,
    large: 24,
    pill: 999,
  },
  shadow: {
    shadowColor: "#25192A",
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
} as const;

export type BrandTheme = keyof typeof brand.colors;
