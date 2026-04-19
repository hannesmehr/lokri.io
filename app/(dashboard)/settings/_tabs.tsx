import { getTranslations } from "next-intl/server";
import { SectionNav } from "../profile/_section-nav";

/**
 * Settings-Tab-Navigation nach dem Block-2-Refactor.
 *
 * Die bisherige bedingte „Team"-Tab-Logik aus `settings/layout.tsx` ist
 * entfernt — Team-Settings leben jetzt unter `/team/*` (Block 3). Dieser
 * Wrapper ersetzt die inline-SectionNav-Instanziierung aus dem früheren
 * Layout; jede Sub-Page rendert ihn direkt unter ihrem `<PageHeader>`
 * (analog zur Profile-Migration in Block 1).
 *
 * Die Keys `settings.navigation.team` bleiben im i18n-Katalog erhalten —
 * Block 3 zieht sie atomar zusammen mit den restlichen `settings.team.*`-
 * Strings nach `team.*` um.
 */
export async function SettingsTabs() {
  const t = await getTranslations("settings.navigation");
  return (
    <SectionNav
      items={[
        { href: "/settings/general", label: t("general") },
        { href: "/settings/mcp", label: t("mcp") },
        { href: "/settings/storage", label: t("storage") },
        { href: "/settings/embedding-key", label: t("embeddingKey") },
      ]}
    />
  );
}
