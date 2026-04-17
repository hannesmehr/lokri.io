import { Lock, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { ChangePasswordDialog } from "./_change-password-dialog";
import { ProfileForm } from "./_profile-form";

export default async function ProfilePage() {
  const { session } = await requireSessionWithAccount();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">Profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persönliche Daten und Zugangskontrolle deines Accounts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
              <User className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Persönliche Daten</CardTitle>
              <CardDescription>
                Der Name wird dir im Dashboard angezeigt und taucht in
                Export-Manifesten auf.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialName={session.user.name}
            email={session.user.email}
            emailVerified={session.user.emailVerified}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-amber-500/15 to-rose-500/15 text-amber-700 dark:text-amber-400">
                <Lock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle>Passwort</CardTitle>
                <CardDescription>
                  Andere Sessions werden beim Passwort-Wechsel abgemeldet.
                </CardDescription>
              </div>
            </div>
            <ChangePasswordDialog />
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
