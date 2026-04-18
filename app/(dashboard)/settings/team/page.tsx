import { eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import {
  Badge,
} from "@/components/ui/badge";
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
          <CardDescription>{t("eyebrow")}</CardDescription>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t("nameLabel")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("nameDescription")}
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {team.planId}
              </Badge>
            </div>
            <TeamNameForm
              teamId={team.id}
              initialName={team.name}
              canEdit={role === "owner" || role === "admin"}
            />
            <div className="flex flex-col gap-2 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <span>{t("memberCount", { count: memberCount })}</span>
              <span>{t("seatCount", { count: memberCount })}</span>
              <span>{t("roleLabel", { role })}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {role === "owner" ? (
        <TeamDeleteCard teamId={team.id} teamName={team.name} />
      ) : null}
    </div>
  );
}
