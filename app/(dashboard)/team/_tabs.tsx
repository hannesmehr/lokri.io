import { getTranslations } from "next-intl/server";
import { SectionNav } from "../profile/_section-nav";

/**
 * Team-Tab-Navigation (Settings-Redesign Block 3).
 *
 * Analog zu `SettingsTabs`: dedizierter Wrapper um die gemeinsame
 * `SectionNav`, lokal aus `profile/_section-nav.tsx` importiert. Drei
 * Tabs: Übersicht / Mitglieder / Sicherheit — siehe
 * `docs/USER_SETTINGS_DESIGN.md` Block „Bereichs-Matrix".
 */
export async function TeamTabs() {
  const t = await getTranslations("team.layout.navigation");
  const tSecurity = await getTranslations("team.security");
  return (
    <SectionNav
      items={[
        { href: "/team", label: t("overview") },
        { href: "/team/members", label: t("members") },
        { href: "/team/security", label: tSecurity("tabLabel") },
      ]}
    />
  );
}
