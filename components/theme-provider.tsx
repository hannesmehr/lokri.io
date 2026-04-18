"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Theme-Provider-Wrapper.
 *
 * Dünne Client-Component-Schicht, die `next-themes` in ein named Export
 * packt — der Root-Layout-Server-Component importiert dieses Modul,
 * während die Bibliothek selbst client-seitig mountet.
 *
 * Konfiguration (in `app/layout.tsx` gesetzt):
 *   - `attribute="class"` → toggelt die `.dark`-Klasse auf `<html>`, das
 *     ist die Variante, die `globals.css` erwartet.
 *   - `defaultTheme="system"` → respektiert `prefers-color-scheme`, bis
 *     der User aktiv wählt.
 *   - `enableSystem` → Option „System" im Toggle.
 *   - `disableTransitionOnChange` → unterdrückt das kurze Color-Flash
 *     beim Umschalten (Farbanimationen würden sonst alle Tokens
 *     gleichzeitig interpolieren).
 *
 * Persistenz liegt im localStorage des Browsers — keine User-Preference
 * in der DB. Das ist ein separater Epic für später.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
