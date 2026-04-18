import { Card, CardContent } from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { LocaleSwitcher } from "./_locale-switcher";
import { ProfileOverviewForm } from "./_overview-form";

export default async function ProfilePage() {
  const { session } = await requireSessionWithAccount();
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <ProfileOverviewForm
            initialName={session.user.name}
            initialImage={session.user.image ?? null}
            email={session.user.email}
            emailVerified={session.user.emailVerified}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <LocaleSwitcher />
        </CardContent>
      </Card>
    </div>
  );
}
