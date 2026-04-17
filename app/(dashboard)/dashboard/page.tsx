import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSessionWithAccount } from "@/lib/api/session";
import { getQuota } from "@/lib/quota";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pct(used: number, max: number) {
  if (max === 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

function UsageBar({ used, max }: { used: number; max: number }) {
  const p = pct(used, max);
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div
        className="h-2 rounded-full bg-foreground transition-all"
        style={{ width: `${p}%` }}
      />
    </div>
  );
}

export default async function DashboardPage() {
  const { session, ownerAccountId } = await requireSessionWithAccount();
  const quota = await getQuota(ownerAccountId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Willkommen zurück</h1>
        <p className="text-sm text-muted-foreground">
          Dein persönlicher MCP-Wissens-Pool. Plan:{" "}
          <Badge variant="secondary">{quota.planId}</Badge>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Speicher
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-foreground">
              {formatBytes(quota.usedBytes)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {formatBytes(quota.maxBytes)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageBar used={quota.usedBytes} max={quota.maxBytes} />
            <p className="mt-2 text-xs text-muted-foreground">
              {pct(quota.usedBytes, quota.maxBytes)}% belegt
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Files
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-foreground">
              {quota.filesCount}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {quota.maxFiles}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageBar used={quota.filesCount} max={quota.maxFiles} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Notes
            </CardTitle>
            <CardDescription className="text-2xl font-semibold text-foreground">
              {quota.notesCount}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / {quota.maxNotes}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsageBar used={quota.notesCount} max={quota.maxNotes} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nächste Schritte</CardTitle>
          <CardDescription>
            Angemeldet als {session.user.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Lege einen <strong>Space</strong> an, füge Notes hinzu oder lade
            Files hoch.
          </p>
          <p>
            In <strong>Settings</strong> generierst du deinen MCP-Token für
            Claude Desktop, ChatGPT, Cursor &amp; Co.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
