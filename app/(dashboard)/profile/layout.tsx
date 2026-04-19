import type { ReactNode } from "react";

/**
 * Profile-Layout — nach dem Block-1-Refactor.
 *
 * Der Layout-H1 + die SectionNav wurden entfernt; jede Sub-Page rendert
 * ihren eigenen `<PageHeader>` und lokal `<ProfileTabs />`. Damit ist
 * die Reihenfolge pro Seite konsistent: PageHeader oben, Tabs direkt
 * darunter, danach die Cards.
 *
 * Der Layout-Container existiert nur noch, damit die Route-Group ihn
 * im Next-Baum stabil findet; er fügt kein eigenes Markup hinzu.
 */
export default function ProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
