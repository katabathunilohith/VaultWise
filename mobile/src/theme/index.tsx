import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, Platform, useColorScheme } from "react-native";
import { getItem, KEYS, setItem } from "@/lib/storage";
import { categoryColors, gainLossCvd, palettes, type CategoryKey, type Palette, type Scheme } from "./tokens";

export * from "./tokens";

/**
 * Appearance follows the system by default (Apple HIG; NN/g 2023). Android and web get an
 * in-app Light / Dark / System choice (Android dark-theme guidance); iOS has none, because
 * Apple asks apps not to offer an app-specific appearance setting.
 */
export type AppearancePref = "system" | "light" | "dark";
export const appearanceSettingAvailable = Platform.OS !== "ios";

interface ThemeValue {
  scheme: Scheme;
  c: Palette;
  pref: AppearancePref;
  setPref: (p: AppearancePref) => void;
  cvdGains: boolean;
  setCvdGains: (v: boolean) => void;
  /** Vault category colours for this scheme. */
  cat: (key: CategoryKey | string) => { fill: string; tint: string };
  gain: string;
  loss: string;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<AppearancePref>("system");
  const [cvdGains, setCvdState] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = (await getItem(KEYS.theme)) ?? "";
      try {
        const parsed = JSON.parse(saved) as { pref?: AppearancePref; cvd?: boolean };
        if (parsed.pref && appearanceSettingAvailable) setPrefState(parsed.pref);
        if (parsed.cvd) setCvdState(true);
      } catch {
        // first launch
      }
    })();
  }, []);

  const scheme: Scheme = pref === "system" ? (system === "light" ? "light" : system === "dark" ? "dark" : "dark") : pref;

  useEffect(() => {
    if (Platform.OS === "android") Appearance.setColorScheme(pref === "system" ? "unspecified" : pref);
  }, [pref]);

  const value = useMemo<ThemeValue>(() => {
    const c = palettes[scheme];
    const persist = (next: { pref: AppearancePref; cvd: boolean }) => void setItem(KEYS.theme, JSON.stringify(next));
    return {
      scheme,
      c,
      pref,
      setPref: (p) => {
        setPrefState(p);
        persist({ pref: p, cvd: cvdGains });
      },
      cvdGains,
      setCvdGains: (v) => {
        setCvdState(v);
        persist({ pref, cvd: v });
      },
      cat: (key) => {
        const k = (key in categoryColors ? key : "custom") as CategoryKey;
        return { fill: categoryColors[k].fill, tint: categoryColors[k].tint[scheme] };
      },
      gain: cvdGains ? gainLossCvd[scheme].up : c.success,
      loss: cvdGains ? gainLossCvd[scheme].down : c.danger,
    };
  }, [scheme, pref, cvdGains]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme must be used inside ThemeProvider");
  return v;
}
