"use client";

import { Check, CloudCog, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Props {
  currentProvider: "vercel_blob" | "s3";
  configured: boolean;
}

interface S3FormState {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathPrefix: string;
  forcePathStyle: boolean;
}

const INITIAL: S3FormState = {
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  pathPrefix: "",
  forcePathStyle: true,
};

export function StorageSection({ currentProvider, configured }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"vercel_blob" | "s3">(currentProvider);
  const [s3, setS3] = useState<S3FormState>(INITIAL);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submitS3(test: boolean) {
    // Minimal client-side check before hitting the server
    if (!s3.bucket || !s3.region || !s3.accessKeyId || !s3.secretAccessKey) {
      toast.error("Bucket, Region, Access-Key-ID und Secret sind Pflicht.");
      return;
    }
    if (test) setTesting(true);
    else setSaving(true);
    const res = await fetch("/api/storage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "s3",
        s3: {
          endpoint: s3.endpoint || undefined,
          region: s3.region,
          bucket: s3.bucket,
          accessKeyId: s3.accessKeyId,
          secretAccessKey: s3.secretAccessKey,
          pathPrefix: s3.pathPrefix || undefined,
          forcePathStyle: s3.forcePathStyle,
        },
        test,
      }),
    });
    setTesting(false);
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error ?? "S3-Test fehlgeschlagen.");
      return;
    }
    toast.success(
      test
        ? "S3-Test erfolgreich — und gespeichert."
        : "S3-Konfig gespeichert.",
    );
    setS3({ ...INITIAL }); // clear secret from memory immediately after save
    router.refresh();
  }

  async function switchToVercelBlob() {
    setSaving(true);
    const res = await fetch("/api/storage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "vercel_blob" }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error ?? "Umstellung fehlgeschlagen.");
      return;
    }
    toast.success("Zurück auf lokri-managed Storage.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm">
          Aktuell:{" "}
          <Badge
            variant="secondary"
            className={
              currentProvider === "s3"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : ""
            }
          >
            {currentProvider === "s3" ? "Eigener S3-Bucket" : "lokri-managed"}
          </Badge>
          {currentProvider === "s3" && configured ? null : null}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="vercel_blob">lokri-managed</TabsTrigger>
          <TabsTrigger value="s3">Eigener S3</TabsTrigger>
        </TabsList>

        <TabsContent value="vercel_blob" className="space-y-3 pt-4">
          <p className="text-sm text-muted-foreground">
            Dateien werden in unserem Vercel-Blob-Storage (EU-Region) privat
            abgelegt. Zero-Setup, passt für die meisten. Der Download läuft
            über unseren Proxy — deine Daten verlassen die lokri-Domain nicht
            an unauthentifizierte Clients.
          </p>
          {currentProvider !== "vercel_blob" ? (
            <Button onClick={switchToVercelBlob} disabled={saving}>
              {saving ? "Stelle um…" : "Auf lokri-managed umstellen"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />
              Aktiv.
            </p>
          )}
        </TabsContent>

        <TabsContent value="s3" className="space-y-4 pt-4">
          <Alert>
            <AlertTitle>Was du brauchst</AlertTitle>
            <AlertDescription className="space-y-1 pt-1 text-xs">
              <div>
                Einen S3-kompatiblen Bucket (AWS S3, Cloudflare R2, Backblaze
                B2, Wasabi, MinIO, …) plus IAM-Credentials mit den Rechten{" "}
                <code>s3:PutObject</code>, <code>s3:GetObject</code>,{" "}
                <code>s3:DeleteObject</code> auf diesem Bucket.
              </div>
              <div>
                Die Credentials werden AES-256-GCM-verschlüsselt in der DB
                abgelegt — der Klartext verlässt den Server nie mehr.
              </div>
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bucket *" value={s3.bucket} onChange={(v) => setS3({ ...s3, bucket: v })} placeholder="mein-lokri-bucket" />
            <Field label="Region *" value={s3.region} onChange={(v) => setS3({ ...s3, region: v })} placeholder="eu-central-1 / auto (R2)" />
            <Field
              label="Endpoint (nur für R2/B2/MinIO)"
              value={s3.endpoint}
              onChange={(v) => setS3({ ...s3, endpoint: v })}
              placeholder="https://<id>.r2.cloudflarestorage.com"
              className="sm:col-span-2"
            />
            <Field label="Access Key ID *" value={s3.accessKeyId} onChange={(v) => setS3({ ...s3, accessKeyId: v })} />
            <Field label="Secret Access Key *" value={s3.secretAccessKey} onChange={(v) => setS3({ ...s3, secretAccessKey: v })} type="password" autoComplete="off" />
            <Field
              label="Path Prefix (optional)"
              value={s3.pathPrefix}
              onChange={(v) => setS3({ ...s3, pathPrefix: v })}
              placeholder="lokri/"
              className="sm:col-span-2"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={s3.forcePathStyle}
                onChange={(e) =>
                  setS3({ ...s3, forcePathStyle: e.target.checked })
                }
              />
              <span>Path-Style erzwingen (für R2 / MinIO sinnvoll)</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              onClick={() => submitS3(true)}
              disabled={testing || saving}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudCog className="h-4 w-4" />
              )}
              {testing ? "Teste & speichere…" : "Test + Speichern"}
            </Button>
            <Button
              variant="outline"
              onClick={() => submitS3(false)}
              disabled={testing || saving}
            >
              {saving ? "Speichere…" : "Ohne Test speichern"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  className?: string;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
      />
    </div>
  );
}
