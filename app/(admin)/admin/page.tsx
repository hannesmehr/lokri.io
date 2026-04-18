import { sql } from "drizzle-orm";
import {
  BarChart3,
  Database,
  FileText as FileIcon,
  Receipt,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import {
  invoices,
  ownerAccounts,
  usageQuota,
  users,
} from "@/lib/db/schema";
import { Breadcrumbs } from "../_breadcrumbs";

/**
 * Admin-Home.
 *
 * MVP-Platzhalter bis Teil 2 mit echten Charts kommt — vier schnelle
 * KPI-Kacheln (ein COUNT je, plus eine SUM für belegtes Bytes-Total).
 * Kein SWR, kein Refresh-Button: die Seite wird pro Navigation frisch
 * gerendert, und für vier COUNTs auf der heutigen Datengröße lohnt
 * sich keine Caching-Ebene.
 */
export default async function AdminHomePage() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [userStats, accountStats, invoiceStats, storageStats] =
    await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(users),
      db.select({ n: sql<number>`count(*)::int` }).from(ownerAccounts),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(invoices)
        .where(sql`${invoices.createdAt} >= ${monthStart.toISOString()}`),
      db
        .select({
          total: sql<number>`coalesce(sum(${usageQuota.usedBytes}), 0)::bigint`,
        })
        .from(usageQuota),
    ]);

  const usersTotal = Number(userStats[0]?.n ?? 0);
  const accountsTotal = Number(accountStats[0]?.n ?? 0);
  const invoicesThisMonth = Number(invoiceStats[0]?.n ?? 0);
  const storageUsedBytes = Number(storageStats[0]?.total ?? 0);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Dashboard" }]} />

      <div>
        <h1 className="font-display text-4xl leading-tight">Admin-Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kurze Momentaufnahme der wichtigsten Zahlen. Detaillierte Statistiken
          folgen in Teil 2.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="User gesamt"
          value={usersTotal.toLocaleString("de-DE")}
        />
        <KpiCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Accounts gesamt"
          value={accountsTotal.toLocaleString("de-DE")}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Rechnungen diesen Monat"
          value={invoicesThisMonth.toLocaleString("de-DE")}
        />
        <KpiCard
          icon={<Database className="h-4 w-4" />}
          label="Storage belegt"
          value={formatBytes(storageUsedBytes)}
        />
      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <FileIcon className="h-4 w-4" />
          <span>
            BI-Dashboard mit Verlaufs-Charts, Top-Accounts, Revenue-Graph und
            Aktivitäts-Heatmap kommt in Teil 2 des Admin-Builds.
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(
    Math.floor(Math.log(n) / Math.log(1024)),
    units.length - 1,
  );
  const value = n / Math.pow(1024, exp);
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: value >= 10 || exp === 0 ? 0 : 1 })} ${units[exp]}`;
}
