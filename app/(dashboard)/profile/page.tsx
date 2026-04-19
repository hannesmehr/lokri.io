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
import { LocaleSwitcher } from "./_locale-switcher";
import { ProfileOverviewForm } from "./_overview-form";
import { ProfileTabs } from "./_tabs";

export default async function ProfilePage() {
  const { session } = await requireSessionWithAccount();
  const tHeader = await getTranslations("profile.overview.pageHeader");
  const tProfileCard = await getTranslations("profile.overview.profileCard");
  const tLocale = await getTranslations("profile.locale");
  return (
    <div className="space-y-6">
      <PageHeader
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <ProfileTabs />
      <Card>
        <CardHeader>
          <CardTitle>{tProfileCard("title")}</CardTitle>
          <CardDescription>{tProfileCard("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileOverviewForm
            initialName={session.user.name}
            initialImage={session.user.image ?? null}
            email={session.user.email}
            emailVerified={session.user.emailVerified}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{tLocale("title")}</CardTitle>
          <CardDescription>{tLocale("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <LocaleSwitcher />
        </CardContent>
      </Card>
    </div>
  );
}
