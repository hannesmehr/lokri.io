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

/**
 * Profile-Übersicht.
 *
 * Settings-Redesign Block 4: Card-in-Card-Doppelung aufgelöst —
 * `ProfileOverviewForm` rendert intern zwei Cards (Öffentliches Profil
 * + E-Mail ändern), die früher in einer äußeren „Öffentliches Profil"-
 * Card verschachtelt waren (identischer Titel doppelt). Jetzt flach.
 *
 * Siehe `docs/USER_SETTINGS_DESIGN.md` Prinzip 3.
 */
export default async function ProfilePage() {
  const { session } = await requireSessionWithAccount();
  const tHeader = await getTranslations("profile.overview.pageHeader");
  const tLocale = await getTranslations("profile.locale");
  return (
    <div className="space-y-6">
      <PageHeader
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <ProfileTabs />
      <ProfileOverviewForm
        initialName={session.user.name}
        initialImage={session.user.image ?? null}
        email={session.user.email}
        emailVerified={session.user.emailVerified}
      />
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
