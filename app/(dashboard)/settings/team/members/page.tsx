import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { listPendingInvites } from "@/lib/teams/invites";
import { listMembers } from "@/lib/teams/members";
import { MembersTable } from "./_members-table";
import { PendingInvites } from "./_pending-invites";

export default async function TeamMembersPage() {
  const { ownerAccountId, accountType, role, session } =
    await requireSessionWithAccount();
  if (accountType !== "team") redirect("/settings");

  const tMembers = await getTranslations("settings.team.members");
  const tInvites = await getTranslations("settings.team.invites");

  const [members, pending] = await Promise.all([
    listMembers(ownerAccountId),
    role === "owner" || role === "admin"
      ? listPendingInvites(ownerAccountId)
      : Promise.resolve([]),
  ]);

  const canManage = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tMembers("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <MembersTable
            teamId={ownerAccountId}
            members={members.map((m) => ({
              ...m,
              joinedAt: m.joinedAt.toISOString(),
            }))}
            currentUserId={session.user.id}
            currentUserRole={role}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{tInvites("pendingTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingInvites
              teamId={ownerAccountId}
              invites={pending.map((p) => ({
                ...p,
                expiresAt: p.expiresAt.toISOString(),
                createdAt: p.createdAt.toISOString(),
              }))}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
