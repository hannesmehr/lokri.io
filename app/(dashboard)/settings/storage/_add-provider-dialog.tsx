"use client";

import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Provider {
  id: string;
  name: string;
  type: "s3";
  createdAt: Date | string;
}

interface S3Form {
  name: string;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathPrefix: string;
  forcePathStyle: boolean;
}

const INITIAL: S3Form = {
  name: "",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  pathPrefix: "",
  forcePathStyle: true,
};

export function AddProviderDialog({
  onCreated,
}: {
  onCreated: (p: Provider) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<S3Form>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function close() {
    if (submitting) return;
    setOpen(false);
    setTimeout(() => {
      setForm(INITIAL);
      setError(null);
      setSuccess(false);
    }, 200);
  }

  const valid =
    form.name.trim() &&
    form.bucket.trim() &&
    form.region.trim() &&
    form.accessKeyId.trim() &&
    form.secretAccessKey.trim();

  async function testAndSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const res = await fetch("/api/storage-providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        type: "s3",
        s3: {
          endpoint: form.endpoint.trim() || undefined,
          region: form.region.trim(),
          bucket: form.bucket.trim(),
          accessKeyId: form.accessKeyId.trim(),
          secretAccessKey: form.secretAccessKey,
          pathPrefix: form.pathPrefix.trim() || undefined,
          forcePathStyle: form.forcePathStyle,
        },
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      setError(data.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const { provider } = await res.json();
    setSuccess(true);
    onCreated(provider);
    toast.success(`Provider "${provider.name}" angelegt.`);
    // Short visual confirmation, then close
    setTimeout(close, 900);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            Neuer Provider
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Neuer Storage-Provider</DialogTitle>
          <DialogDescription>
            S3-kompatibel (AWS, Cloudflare R2, Backblaze B2, Wasabi, MinIO).
            Wir testen die Verbindung vor dem Speichern — falsche Credentials
            werden nicht gespeichert.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTitle>Credentials bleiben verschlüsselt</AlertTitle>
          <AlertDescription className="text-xs">
            Zugriffsdaten werden AES-256-GCM-verschlüsselt in der DB abgelegt
            und niemals wieder im Klartext zurückgegeben.
          </AlertDescription>
        </Alert>

        <form onSubmit={testAndSave} className="space-y-4">
          <Field
            label="Name *"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            placeholder="z.B. Mein R2 Bucket"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Bucket *"
              value={form.bucket}
              onChange={(v) => setForm({ ...form, bucket: v })}
              placeholder="mein-lokri-bucket"
            />
            <Field
              label="Region *"
              value={form.region}
              onChange={(v) => setForm({ ...form, region: v })}
              placeholder="eu-central-1 / auto (R2)"
            />
            <Field
              label="Endpoint (R2/B2/MinIO)"
              value={form.endpoint}
              onChange={(v) => setForm({ ...form, endpoint: v })}
              placeholder="https://<id>.r2.cloudflarestorage.com"
              className="sm:col-span-2"
            />
            <Field
              label="Access Key ID *"
              value={form.accessKeyId}
              onChange={(v) => setForm({ ...form, accessKeyId: v })}
              autoComplete="off"
            />
            <Field
              label="Secret Access Key *"
              value={form.secretAccessKey}
              onChange={(v) => setForm({ ...form, secretAccessKey: v })}
              type="password"
              autoComplete="off"
            />
            <Field
              label="Path Prefix (optional)"
              value={form.pathPrefix}
              onChange={(v) => setForm({ ...form, pathPrefix: v })}
              placeholder="lokri/"
              className="sm:col-span-2"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.forcePathStyle}
              onChange={(e) =>
                setForm({ ...form, forcePathStyle: e.target.checked })
              }
            />
            <span>Path-Style erzwingen (für R2 / MinIO sinnvoll)</span>
          </label>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : null}
              {submitting
                ? "Teste Verbindung…"
                : success
                  ? "Gespeichert"
                  : "Testen & Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
