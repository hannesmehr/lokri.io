import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../../_breadcrumbs";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  apiTokens,
  ownerAccountMembers,
  ownerAccounts,
  sessions,
  users,
} from "@/lib/db/schema";
import { UserDetailClient } from "./_client";

type Params = { params: Promise<{ id: string }> };

/**
 * Server-Component lädt alle Daten auf einmal (User + Accounts + Tokens +
 * Sessions), reicht sie ans Client-Island durch. Die Client-Seite
 * übernimmt die Mutationen + Re-Fetch.
 */
export default async function AdminUserDetailPage({ params }: Params) {
  const { userId: actorId } = await requireAdminSession();
  const { id } = await params;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) notFound();

  const [accounts, tokens, activeSessions] = await Promise.all([
    db
      .select({
        accountId: ownerAccounts.id,
        accountName: ownerAccounts.name,
        accountType: ownerAccounts.type,
        planId: ownerAccounts.planId,
        role: ownerAccountMembers.role,
        joinedAt: ownerAccountMembers.joinedAt,
      })
      .from(ownerAccountMembers)
      .innerJoin(
        ownerAccounts,
        eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
      )
      .where(eq(ownerAccountMembers.userId, id))
      .orderBy(desc(ownerAccountMembers.joinedAt)),
    db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        scopeType: apiTokens.scopeType,
        ownerAccountId: apiTokens.ownerAccountId,
        readOnly: apiTokens.readOnly,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.createdByUserId, id))
      .orderBy(desc(apiTokens.createdAt)),
    db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, id))
      .orderBy(desc(sessions.createdAt))
      .limit(50),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "User", href: "/admin/users" },
          { label: user.email },
        ]}
      />
      <UserDetailClient
        actorId={actorId}
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          emailVerified: user.emailVerified,
          isAdmin: user.isAdmin,
          canCreateTeams: user.canCreateTeams,
          preferredLocale: user.preferredLocale,
          disabledAt: user.disabledAt ? user.disabledAt.toISOString() : null,
          createdAt: user.createdAt.toISOString(),
        }}
        accounts={accounts.map((a) => ({
          ...a,
          joinedAt: a.joinedAt.toISOString(),
        }))}
        tokens={tokens.map((t) => ({
          ...t,
          lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
          createdAt: t.createdAt.toISOString(),
          revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
        }))}
        sessions={activeSessions.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
        }))}
      />
    </div>
  );
}
