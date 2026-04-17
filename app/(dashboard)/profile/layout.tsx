import type { ReactNode } from "react";
import { SectionNav } from "./_section-nav";

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl leading-tight">Profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persönliche Daten, Sicherheit, Daten-Portabilität.
        </p>
      </div>
      <SectionNav
        items={[
          { href: "/profile", label: "Übersicht" },
          { href: "/profile/security", label: "Sicherheit" },
          { href: "/profile/data", label: "Daten" },
        ]}
      />
      {children}
    </div>
  );
}
