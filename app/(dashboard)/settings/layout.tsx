import type { ReactNode } from "react";

/**
 * Settings-Layout — nach dem Block-2-Refactor.
 *
 * Der Layout-H1 + die SectionNav sind weg (analog zur Profile-
 * Migration in Block 1). Jede Sub-Page rendert ihren eigenen
 * `<PageHeader>` + `<SettingsTabs />` + `<SettingsScopeHint />`.
 *
 * Der conditional-Team-Tab aus der alten Layout-Logik (`if
 * accountType === "team"`) ist ebenfalls entfallen — Team-Settings
 * leben jetzt unter `/team/*` (Block 3).
 *
 * Pass-Through-Container, damit die Route-Group stabil im Next-Baum
 * sitzt.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
