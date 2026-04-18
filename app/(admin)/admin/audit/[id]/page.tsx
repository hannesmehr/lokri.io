import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../../_breadcrumbs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { auditEvents, ownerAccounts, users } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

/**
 * Audit-Event-Detail. Server-gerendert — Events sind immutable,
 * Live-Updates braucht hier niemand. Zeigt die volle Metadata, volle
 * User-Agent-String, Quick-Links zu "mehr Events von Actor/Account".
 */
export default async function AdminAuditDetailPage({ params }: Params) {
  await requireAdminSession();
  const { id } = await params;

  const [row] = await db
    .select({
      event: auditEvents,
      actorEmail: users.email,
      actorName: users.name,
      ownerAccountName: ownerAccounts.name,
      ownerAccountType: ownerAccounts.type,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .innerJoin(ownerAccounts, eq(ownerAccounts.id, auditEvents.ownerAccountId))
    .where(eq(auditEvents.id, id))
    .limit(1);
  if (!row) notFound();

  const e = row.event;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Audit", href: "/admin/audit" },
          { label: e.action },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-xl">{e.action}</CardTitle>
          <CardDescription>
            Event-ID <span className="font-mono">{e.id}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Row label="Zeitstempel">
              {e.createdAt.toLocaleString("de-DE", {
                year: "numeric",
                month: "long",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </Row>
            <Row label="Owner-Account">
              <Link
                href={`/admin/accounts/${e.ownerAccountId}`}
                className="hover:underline"
              >
                {row.ownerAccountName}
              </Link>{" "}
              <span className="text-xs text-muted-foreground">
                ({row.ownerAccountType})
              </span>
            </Row>
            <Row label="Actor">
              {row.actorEmail ? (
                <Link
                  href={`/admin/users/${e.actorUserId}`}
                  className="hover:underline"
                >
                  {row.actorEmail}
                </Link>
              ) : (
                <span className="text-muted-foreground">system</span>
              )}
            </Row>
            <Row label="Target">
              {e.targetType ? (
                <>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.targetType}
                  </span>
                  {e.targetId ? (
                    <>
                      {" · "}
                      <span className="font-mono text-xs">{e.targetId}</span>
                    </>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Row>
            <Row label="IP-Adresse">
              <span className="font-mono text-xs">{e.ipAddress ?? "—"}</span>
            </Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User-Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/30 p-3 text-[11px] leading-snug">
            {e.userAgent ?? "—"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Metadata</CardTitle>
          <CardDescription>Der `metadata`-Blob als formatiertes JSON.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted/30 p-3 text-[11px] leading-relaxed">
            {e.metadata ? JSON.stringify(e.metadata, null, 2) : "null"}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weitere Events</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {e.actorUserId ? (
            <Link
              href={`/admin/audit?actorUserId=${e.actorUserId}`}
              className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
            >
              Alle Events von diesem Actor
            </Link>
          ) : null}
          <Link
            href={`/admin/audit?ownerAccountId=${e.ownerAccountId}`}
            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            Alle Events für diesen Account
          </Link>
          <Link
            href={`/admin/audit?action=${encodeURIComponent(e.action)}`}
            className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
          >
            Alle Events dieser Action
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
