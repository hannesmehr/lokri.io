import { getTranslations } from "next-intl/server";

/**
 * Ein-Satz-Info über den aktuell aktiven Account-Scope, direkt unter
 * den Tabs auf jeder `/settings/*`-Page. Macht transparent, ob eine
 * Einstellung gerade für den Personal-Account oder für ein Team greift
 * — der AccountSwitcher oben verrät das auch, aber die Wiederholung
 * auf Page-Ebene verhindert versehentliche Fehleingaben.
 *
 * Nur Text (kein Card, keine Box), `text-xs text-muted-foreground` —
 * bewusst zurückhaltend, sollen die Cards darunter nicht kapern.
 */
export async function SettingsScopeHint({
  accountType,
  accountName,
}: {
  accountType: "personal" | "team";
  accountName: string;
}) {
  const t = await getTranslations("settings.scopeHint");
  return (
    <p className="text-xs text-muted-foreground">
      {accountType === "team"
        ? t("team", { name: accountName })
        : t("personal")}
    </p>
  );
}
