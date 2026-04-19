import { ArrowLeftRight } from "lucide-react";
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
import { DangerZone } from "../_danger-zone";
import { DataPortability } from "../_data-portability";
import { ProfileTabs } from "../_tabs";

export default async function ProfileDataPage() {
  const { session } = await requireSessionWithAccount();
  const t = await getTranslations("profile.data");
  const tLayout = await getTranslations("profile.layout");
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/profile" },
          { label: tLayout("navigation.data") },
        ]}
        title={t("pageHeader.title")}
        description={t("pageHeader.description")}
      />
      <ProfileTabs />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("subtitle")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataPortability />
        </CardContent>
      </Card>
      <DangerZone userEmail={session.user.email} />
    </div>
  );
}
