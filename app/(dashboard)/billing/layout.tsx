import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SectionNav } from "../profile/_section-nav";

export default async function BillingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("billing");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl leading-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SectionNav
        items={[
          { href: "/billing", label: t("navigation.overview") },
          { href: "/billing/plans", label: t("navigation.plans") },
          { href: "/billing/invoices", label: t("navigation.invoices") },
        ]}
      />
      {children}
    </div>
  );
}
