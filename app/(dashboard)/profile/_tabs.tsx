import { getTranslations } from "next-intl/server";
import { SectionNav } from "./_section-nav";

/**
 * Profile-Tab-Navigation — lokal statt im Layout, damit die Reihenfolge
 * `<PageHeader> → <ProfileTabs /> → Cards` pro Seite kontrolliert bleibt.
 * Das Layout selbst rendert nichts mehr strukturell (kein H1, kein
 * Navigations-Container) — der H1 lebt seit Block 1 in `<PageHeader>`.
 *
 * Shape der Items ist identisch zum früheren Layout-Code, nur ausgelagert
 * damit wir nicht in jeder der drei Sub-Pages dieselben 4 Zeilen haben.
 */
export async function ProfileTabs() {
  const t = await getTranslations("profile.layout");
  return (
    <SectionNav
      items={[
        { href: "/profile", label: t("navigation.overview") },
        { href: "/profile/security", label: t("navigation.security") },
        { href: "/profile/data", label: t("navigation.data") },
      ]}
    />
  );
}
