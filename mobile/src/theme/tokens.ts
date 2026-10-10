/**
 * Vaultwise design tokens.
 *
 * Colour: the structure the most successful Gen Z apps share — a near-black base,
 * one saturated signature accent used sparingly, greyscale for everything else,
 * dark designed first with light fully equal (research: 23-app colour survey).
 * The accent is "Fuchsia": the most common hue family among those apps (red/pink),
 * placed where no payment brand in our 8 markets sits within ΔE00 15
 * (research: 135-brand collision map). Every pair below was checked against
 * WCAG 2.2 — 68/68 pass (scratchpad/palette/check.mjs).
 *
 * Rules
 * - Neutrals cover ~85–90% of a screen; accent ≤10% (one primary action, the active tab, key highlights).
 * - Status colours appear only where there is a status, always with an icon + label (WCAG 1.4.1).
 * - Category colours are UI-only (icon tint, progress, chips, vault card fills with ink text),
 *   never money amounts or status, and never in the logo.
 * - Gradients only for saving milestones, never behind amounts or text blocks.
 */

export type Scheme = "light" | "dark";

export interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  /** Accent for text, icons and focus on this theme's surfaces. */
  accent: string;
  /** Filled primary button. Fuchsia on dark; ink on light (monochrome + pops). */
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  /** Decorative fuchsia fill (chips, highlights, selection). Always carries ink text. */
  accentFill: string;
  onAccentFill: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningFill: string;
  onWarning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  /** Text/icons placed on any vivid fill (category or status). */
  ink: string;
  /** Light "paper" for documents and receipts, in both themes (reading is better on light). */
  paper: string;
  scrim: string;
  /** Practice-mode chip. */
  practice: string;
  onPractice: string;
}

export const palettes: Record<Scheme, Palette> = {
  dark: {
    bg: "#0D0A0E",
    surface: "#18141A",
    surfaceRaised: "#221D25",
    border: "#302A33",
    borderStrong: "#756D7A",
    text: "#F7F2F5",
    textMuted: "#ADA5AE",
    accent: "#FF4FB2",
    primary: "#FF4FB2",
    primaryPressed: "#E63F9E",
    onPrimary: "#0D0A0E",
    accentFill: "#FF4FB2",
    onAccentFill: "#0D0A0E",
    accentSoft: "#3A1A2D",
    success: "#52E9B2",
    successSoft: "#1A2E27",
    warning: "#FFCD54",
    warningFill: "#FFCD54",
    onWarning: "#0D0A0E",
    warningSoft: "#332A16",
    danger: "#FF5A47",
    dangerSoft: "#3A1C1A",
    info: "#8DB9FF",
    infoSoft: "#1C2433",
    ink: "#0D0A0E",
    paper: "#FBF8F3",
    scrim: "rgba(0,0,0,0.6)",
    practice: "#2A2530",
    onPractice: "#E9E2EC",
  },
  light: {
    bg: "#F8F5F7",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    border: "#E9E3E7",
    borderStrong: "#8A828E",
    text: "#151217",
    textMuted: "#5E5761",
    accent: "#8E567C",
    primary: "#151217",
    primaryPressed: "#2E2832",
    onPrimary: "#FFFFFF",
    accentFill: "#FF4FB2",
    onAccentFill: "#0D0A0E",
    accentSoft: "#FCE7F2",
    success: "#047A5C",
    successSoft: "#E8F4EF",
    warning: "#895706",
    warningFill: "#F5AF20",
    onWarning: "#1A1300",
    warningSoft: "#FEF6E4",
    danger: "#C9241B",
    dangerSoft: "#FBECEA",
    info: "#2F6FD0",
    infoSoft: "#EAF1FC",
    ink: "#151217",
    paper: "#FFFFFF",
    scrim: "rgba(21,18,23,0.45)",
    practice: "#EEE8EE",
    onPractice: "#3D3540",
  },
};

export type CategoryKey = "health" | "education" | "housing" | "emergency" | "retirement" | "custom";

/**
 * Vault category colours. `fill` is the vivid hue used as a card/chip fill with ink text in
 * both themes; `tint` is for icons/progress drawn on this theme's surface (≥3:1).
 */
export const categoryColors: Record<CategoryKey, { fill: string; tint: Record<Scheme, string> }> = {
  health: { fill: "#4DECE4", tint: { dark: "#4DECE4", light: "#077F7A" } },
  education: { fill: "#5FA7FD", tint: { dark: "#5FA7FD", light: "#3A81D7" } },
  housing: { fill: "#F8A650", tint: { dark: "#F8A650", light: "#C06F0A" } },
  emergency: { fill: "#F36069", tint: { dark: "#F36069", light: "#C52D23" } },
  retirement: { fill: "#B688FE", tint: { dark: "#B688FE", light: "#7A36D0" } },
  custom: { fill: "#C2F26C", tint: { dark: "#C2F26C", light: "#456B07" } },
};

/** Milestone gradient (celebrations of saving only). */
export const celebrate = ["#FF4FB2", "#B688FE", "#4DECE4"] as const;

/** Colour-blind friendly gains/losses (Settings toggle). */
export const gainLossCvd: Record<Scheme, { up: string; down: string }> = {
  dark: { up: "#5FA7FD", down: "#F8A650" },
  light: { up: "#2F6FD0", down: "#B35F00" },
};

export const space = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

/** Layout constants from the thumb-reach spec. */
export const layout = {
  gutter: 16,
  gutterWide: 20,
  ctaHeight: 56,
  ctaBottomGap: 16,
  secondaryHeight: 48,
  rowMin: 56,
  keyHeight: 64,
  keyGap: 8,
  hit: 44,
  /** Extra scroll padding so the last item can reach the middle of the screen. */
  tabRootBottomPad: 96,
  maxContentWidth: 560,
} as const;

/** Font family names, as registered by useFonts in the root layout. */
export const fonts = {
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemi: "Figtree_600SemiBold",
  bodyBold: "Figtree_700Bold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
  monoSemi: "GeistMono_600SemiBold",
} as const;

export type TypeToken =
  | "displayXL"
  | "displayL"
  | "displayM"
  | "headline"
  | "titleL"
  | "titleM"
  | "bodyL"
  | "bodyM"
  | "labelL"
  | "labelM"
  | "caption"
  | "micro"
  | "numXL"
  | "numL"
  | "numM"
  | "numS";

/** Type scale (pt = dp). Display faces only at 22pt and above. */
export const type: Record<TypeToken, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number; maxScale?: number }> = {
  displayXL: { fontFamily: fonts.display, fontSize: 56, lineHeight: 58, letterSpacing: -1.4, maxScale: 1.3 },
  displayL: { fontFamily: fonts.display, fontSize: 44, lineHeight: 47, letterSpacing: -1.0, maxScale: 1.3 },
  displayM: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38, letterSpacing: -0.5, maxScale: 1.5 },
  headline: { fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 32, letterSpacing: -0.3, maxScale: 1.6 },
  titleL: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, letterSpacing: -0.2 },
  titleM: { fontFamily: fonts.bodySemi, fontSize: 18, lineHeight: 24, letterSpacing: 0 },
  bodyL: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, letterSpacing: 0 },
  bodyM: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  labelL: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 22, letterSpacing: 0 },
  labelM: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, letterSpacing: 0.1 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  micro: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 0.3 },
  numXL: { fontFamily: fonts.monoSemi, fontSize: 40, lineHeight: 44, letterSpacing: -1.0, maxScale: 1.3 },
  numL: { fontFamily: fonts.monoMedium, fontSize: 20, lineHeight: 24, letterSpacing: -0.2 },
  numM: { fontFamily: fonts.monoMedium, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  numS: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
};

/** Motion tokens (Material 3 durations; Reduce Motion swaps movement for 150 ms fades). */
export const motion = {
  instant: 100,
  quick: 200,
  base: 300,
  exit: 200,
  screen: 450,
  celebrateMax: 1000,
  /** Ignore taps on a freshly shown step's main button, so a double tap can't carry over. */
  ctaArmDelay: 400,
  spring: { damping: 20, stiffness: 300, mass: 1 },
  springCelebrate: { damping: 11, stiffness: 180, mass: 1 },
} as const;
