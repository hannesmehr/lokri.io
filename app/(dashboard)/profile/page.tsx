import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { LocaleSwitcher } from "./_locale-switcher";
import { ProfileOverviewForm } from "./_overview-form";

export default async function ProfilePage() {
  const { session } = await requireSessionWithAccount();
  const tOverview = await getTranslations("profile.overview");
  const tLocale = await getTranslations("profile.locale");
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tOverview("title")}</CardTitle>
          <CardDescription>{tOverview("subtitle")}</CardDescription>
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
