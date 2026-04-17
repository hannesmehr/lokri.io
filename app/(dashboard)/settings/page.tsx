import { ArrowLeftRight, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { DangerZone } from "./_danger-zone";
import { DataPortability } from "./_data-portability";
import { TwoFactorSection } from "./_two-factor-section";

export default async function SettingsPage() {
  const { session } = await requireSessionWithAccount();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sicherheit, Daten-Portabilität und Account-Löschung.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-amber-500/15 to-rose-500/15 text-amber-700 dark:text-amber-400">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Sicherheit</CardTitle>
              <CardDescription>
                Zusätzlicher Schutz für deinen Account.
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-sky-500/15 to-emerald-500/15 text-sky-700 dark:text-sky-400">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Daten-Portabilität</CardTitle>
              <CardDescription>
                Export als ZIP (DSGVO Art. 20) oder Import aus einem
                lokri-Export / Obsidian-Vault.
              </CardDescription>
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
