import { Lock, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { ChangePasswordDialog } from "../_change-password-dialog";
import { TwoFactorSection } from "../_two-factor-section";

export default async function ProfileSecurityPage() {
  const { session } = await requireSessionWithAccount();

  return (
    <div className="space-y-6">
      {/* Passwort */}
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

      {/* 2FA */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-pink-500/15 text-violet-700 dark:text-violet-400">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Zwei-Faktor-Authentifizierung</CardTitle>
              <CardDescription>
                TOTP-Code aus einer Authenticator-App + Backup-Codes.
              </CardDescription>
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
