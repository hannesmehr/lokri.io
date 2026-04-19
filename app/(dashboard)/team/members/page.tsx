import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireTeamAccount } from "@/lib/api/session";
import { listPendingInvites } from "@/lib/teams/invites";
import { listMembers } from "@/lib/teams/members";
import { TeamTabs } from "../_tabs";
import { MembersTable } from "./_members-table";
import { PendingInvites } from "./_pending-invites";

export default async function TeamMembersPage() {
  const { ownerAccountId, role, session } = await requireTeamAccount();

  const tHeader = await getTranslations("team.pageHeader.members");
  const tLayout = await getTranslations("team.layout");
  const tMembers = await getTranslations("team.members");
  const tInvites = await getTranslations("team.invites");

  const [members, pending] = await Promise.all([
    listMembers(ownerAccountId),
    role === "owner" || role === "admin"
      ? listPendingInvites(ownerAccountId)
      : Promise.resolve([]),
  ]);

  const canManage = role === "owner" || role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: tLayout("title"), href: "/team" },
          { label: tLayout("navigation.members") },
        ]}
        title={tHeader("title")}
        description={tHeader("description")}
      />
      <TeamTabs />

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {tMembers("title")}
          </CardTitle>
          <CardDescription>{tMembers("subtitle")}</CardDescription>
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
            <CardDescription>{tInvites("pendingDescription")}</CardDescription>
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
