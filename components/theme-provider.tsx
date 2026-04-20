"use client";

import {
  useCallback,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type ResolvedTheme = "light" | "dark";
type Attribute = `data-${string}` | "class";
type ValueObject = Record<string, string>;

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: string;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  storageKey?: string;
  attribute?: Attribute | Attribute[];
  value?: ValueObject;
  forcedTheme?: string;
}

interface ThemeContextValue {
  theme?: string;
  resolvedTheme: ResolvedTheme;
  systemTheme?: ResolvedTheme;
  forcedTheme?: string;
  themes: string[];
  setTheme: Dispatch<SetStateAction<string>>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DEFAULT_THEMES = ["light", "dark"];

function getSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function applyTheme(
  resolvedTheme: ResolvedTheme,
  attribute: Attribute | Attribute[],
  value?: ValueObject,
  enableColorScheme = true,
) {
  const root = document.documentElement;
  const attributes = Array.isArray(attribute) ? attribute : [attribute];
  const mappedValue = value?.[resolvedTheme] ?? resolvedTheme;

  for (const attr of attributes) {
    if (attr === "class") {
      root.classList.remove("light", "dark");
      root.classList.add(mappedValue);
      continue;
    }
    root.setAttribute(attr, mappedValue);
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme;
  }
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important}",
    ),
  );
  document.head.appendChild(style);
  return () => {
    window.getComputedStyle(document.body);
    setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}

/**
 * Lokaler Bugfix-Shim für `next-themes`.
 *
 * Hintergrund: `next-themes@0.4.6` rendert intern ein `<script>` aus einer
 * Client-Component. Unter Next 16 / React 19 erzeugt genau das die Warnung
 * "Encountered a script tag while rendering React component".
 *
 * Wir ersetzen hier nicht das Theme-System des Projekts, sondern nur diesen
 * einen problematischen Render-Pfad:
 * - dieselbe Produkt-Semantik wie vorher (`light` / `dark` / `system`)
 * - Persistenz via localStorage
 * - `.dark` auf `<html>`
 * - serverseitiges Init-Script in `app/layout.tsx`, damit kein Flash entsteht
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = false,
  enableColorScheme = true,
  storageKey = "theme",
  attribute = "data-theme",
  value: themeValueMap,
  forcedTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<string>(() => {
    if (typeof window === "undefined") return defaultTheme;
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : defaultTheme;
    } catch {
      return defaultTheme;
    }
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );
  const resolvedTheme =
    forcedTheme === "dark" || forcedTheme === "light"
      ? forcedTheme
      : theme === "system" && enableSystem
      ? systemTheme
      : theme === "dark"
        ? "dark"
        : "light";

  useLayoutEffect(() => {
    const cleanup = disableTransitionOnChange
      ? disableTransitionsTemporarily()
      : null;
    applyTheme(
      resolvedTheme,
      attribute,
      themeValueMap,
      enableColorScheme,
    );
    cleanup?.();
  }, [
    resolvedTheme,
    attribute,
    themeValueMap,
    enableColorScheme,
    disableTransitionOnChange,
  ]);

  useLayoutEffect(() => {
    if (!enableSystem || theme !== "system" || forcedTheme) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(getSystemTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [enableSystem, theme, forcedTheme]);

  const setTheme = useCallback((nextTheme: SetStateAction<string>) => {
    const resolvedNextTheme =
      typeof nextTheme === "function" ? nextTheme(theme) : nextTheme;
    setThemeState(resolvedNextTheme);
    try {
      window.localStorage.setItem(storageKey, resolvedNextTheme);
    } catch {
      // ignore storage write failures
    }
  }, [storageKey, theme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      systemTheme,
      forcedTheme,
      themes: enableSystem ? [...DEFAULT_THEMES, "system"] : DEFAULT_THEMES,
      setTheme,
    }),
    [theme, resolvedTheme, systemTheme, forcedTheme, enableSystem, setTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used within ThemeProvider.");
  }
  return value;
}
