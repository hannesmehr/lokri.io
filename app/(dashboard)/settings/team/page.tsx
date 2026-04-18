import { eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccountMembers, ownerAccounts } from "@/lib/db/schema";
import { TeamNameForm } from "./_name-form";
import { TeamDeleteCard } from "./_delete-card";

export default async function TeamOverviewPage() {
  const { ownerAccountId, accountType, role } = await requireSessionWithAccount();
  if (accountType !== "team") redirect("/settings");

  const t = await getTranslations("settings.team.overview");

  const [team] = await db
    .select({
      id: ownerAccounts.id,
      name: ownerAccounts.name,
      planId: ownerAccounts.planId,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);
  if (!team) notFound();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ownerAccountMembers)
    .where(eq(ownerAccountMembers.ownerAccountId, ownerAccountId));
  const memberCount = Number(count ?? 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("nameLabel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamNameForm
            teamId={team.id}
            initialName={team.name}
            canEdit={role === "owner" || role === "admin"}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{t("memberCount", { count: memberCount })}</CardDescription>
            <CardTitle>{t("seatsUsed", { count: memberCount })}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("planLabel")}</CardDescription>
            <CardTitle>{t("planStatic")}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {role === "owner" ? (
        <TeamDeleteCard teamId={team.id} teamName={team.name} />
      ) : null}
    </div>
  );
}
