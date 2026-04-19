import { Lock, Shield } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireSessionWithAccount } from "@/lib/api/session";
import { ChangePasswordDialog } from "../_change-password-dialog";
import { ProfileTabs } from "../_tabs";
import { TwoFactorSection } from "../_two-factor-section";

export default async function ProfileSecurityPage() {
  const { session } = await requireSessionWithAccount();
  const t = await getTranslations("profile.security");
  const tLayout = await getTranslations("profile.layout");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/profile" },
          { label: tLayout("navigation.security") },
        ]}
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
      />
      <ProfileTabs />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>{t("password.title")}</CardTitle>
                <CardDescription>{t("password.description")}</CardDescription>
              </div>
            </div>
            <ChangePasswordDialog />
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("twoFactor.title")}</CardTitle>
              <CardDescription>{t("twoFactor.subtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TwoFactorSection
            enabled={Boolean(
              (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
