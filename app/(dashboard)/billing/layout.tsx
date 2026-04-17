import type { ReactNode } from "react";
import { SectionNav } from "../profile/_section-nav";

export default function BillingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl leading-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aktueller Plan, Preise und Rechnungen.
        </p>
      </div>
      <SectionNav
        items={[
          { href: "/billing", label: "Übersicht" },
          { href: "/billing/plans", label: "Plans" },
          { href: "/billing/invoices", label: "Rechnungen" },
        ]}
      />
      {children}
    </div>
  );
}
