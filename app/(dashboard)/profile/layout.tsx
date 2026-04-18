import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SectionNav } from "./_section-nav";

export default async function ProfileLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("profile");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl leading-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <SectionNav
        items={[
          { href: "/profile", label: t("navigation.overview") },
          { href: "/profile/security", label: t("navigation.security") },
          { href: "/profile/data", label: t("navigation.data") },
        ]}
      />
      {children}
    </div>
  );
}
