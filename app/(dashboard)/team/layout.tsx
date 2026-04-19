import type { ReactNode } from "react";
import { requireTeamAccount } from "@/lib/api/session";

/**
 * Team-Layout (Settings-Redesign Block 3).
 *
 * Zwei Aufgaben:
 *   1. Server-Guard `requireTeamAccount()` — schließt Personal-Accounts
 *      aus. Der Helper wirft einen `redirect("/dashboard?teamRequired=1")`,
 *      wenn der aktive Account nicht vom Typ `team` ist. Damit ist der
 *      Guard **auf Layout-Ebene serverseitig aktiv** — keine der drei
 *      Sub-Pages muss ihn wiederholen.
 *   2. Pass-Through-Container. Jede Sub-Page rendert ihren eigenen
 *      `<PageHeader>` + `<TeamTabs />` in der gewohnten Reihenfolge
 *      (analog zum Profile- und Settings-Layout-Stripdown aus
 *      vorherigen Blöcken).
 */
export default async function TeamLayout({ children }: { children: ReactNode }) {
  await requireTeamAccount();
  return children;
}
