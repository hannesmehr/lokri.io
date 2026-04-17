import type { ReactNode } from "react";
import { SectionNav } from "../profile/_section-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl leading-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kontowide Einstellungen, Storage-Anbieter.
        </p>
      </div>
      <SectionNav
        items={[
          { href: "/settings", label: "Allgemein" },
          { href: "/settings/mcp", label: "MCP" },
          { href: "/settings/storage", label: "Storage" },
        ]}
      />
      {children}
    </div>
  );
}
