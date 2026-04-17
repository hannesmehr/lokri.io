import { eq } from "drizzle-orm";
import { ArrowLeftRight, HardDrive, Lock, Shield, User } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts } from "@/lib/db/schema";
import { ChangePasswordDialog } from "./_change-password-dialog";
import { DangerZone } from "./_danger-zone";
import { DataPortability } from "./_data-portability";
import { ProfileForm } from "./_profile-form";
import { StorageSection } from "./_storage-section";
import { TwoFactorSection } from "./_two-factor-section";

export default async function ProfilePage() {
  const { session, ownerAccountId } = await requireSessionWithAccount();
  const [account] = await db
    .select({
      storageProvider: ownerAccounts.storageProvider,
      storageConfigEncrypted: ownerAccounts.storageConfigEncrypted,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl leading-tight">Profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Persönliche Daten, Sicherheit und Daten-Portabilität.
        </p>
      </div>

      {/* Persönliche Daten */}
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

      {/* Sicherheit (2FA) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-pink-500/15 text-violet-700 dark:text-violet-400">
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

      {/* Storage-Backend (BYO-S3) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-500/15 to-sky-500/15 text-cyan-700 dark:text-cyan-400">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Storage</CardTitle>
              <CardDescription>
                Neue Uploads in lokris Blob-Storage oder deinem eigenen
                S3-Bucket (AWS, R2, B2, MinIO …). Bereits existierende Dateien
                bleiben da wo sie sind.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StorageSection
            currentProvider={
              (account?.storageProvider ?? "vercel_blob") as
                | "vercel_blob"
                | "s3"
            }
            configured={account?.storageConfigEncrypted !== null}
          />
        </CardContent>
      </Card>

      {/* Daten-Portabilität */}
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

      {/* Danger Zone */}
      <DangerZone userEmail={session.user.email} />
    </div>
  );
}
