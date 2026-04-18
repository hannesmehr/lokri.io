"use client";

import { CheckCircle2, FolderGit2, HardDrive, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { cn } from "@/lib/utils";

type ProviderType = "s3" | "github";

interface Provider {
  id: string;
  name: string;
  type: ProviderType;
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

interface GitHubForm {
  name: string;
  accessToken: string;
  owner: string;
  repo: string;
  ref: string;
  pathPrefix: string;
}

const S3_INITIAL: S3Form = {
  name: "",
  endpoint: "",
  region: "us-east-1",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  pathPrefix: "",
  forcePathStyle: true,
};

const GITHUB_INITIAL: GitHubForm = {
  name: "",
  accessToken: "",
  owner: "",
  repo: "",
  ref: "",
  pathPrefix: "",
};

export function AddProviderDialog({
  onCreated,
}: {
  onCreated: (p: Provider) => void;
}) {
  const t = useTranslations("settings.storage.add");
  const tErrors = useTranslations("errors.api.storageProvider");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ProviderType>("s3");
  const [s3Form, setS3Form] = useState<S3Form>(S3_INITIAL);
  const [ghForm, setGhForm] = useState<GitHubForm>(GITHUB_INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function close() {
    if (submitting) return;
    setOpen(false);
    setTimeout(() => {
      setS3Form(S3_INITIAL);
      setGhForm(GITHUB_INITIAL);
      setError(null);
      setSuccess(false);
      setTab("s3");
    }, 200);
  }

  const valid =
    tab === "s3"
      ? Boolean(
          s3Form.name.trim() &&
            s3Form.bucket.trim() &&
            s3Form.region.trim() &&
            s3Form.accessKeyId.trim() &&
            s3Form.secretAccessKey.trim(),
        )
      : Boolean(ghForm.name.trim() && ghForm.owner.trim() && ghForm.repo.trim());

  async function testAndSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    const payload =
      tab === "s3"
        ? {
            name: s3Form.name.trim(),
            type: "s3" as const,
            s3: {
              endpoint: s3Form.endpoint.trim() || undefined,
              region: s3Form.region.trim(),
              bucket: s3Form.bucket.trim(),
              accessKeyId: s3Form.accessKeyId.trim(),
              secretAccessKey: s3Form.secretAccessKey,
              pathPrefix: s3Form.pathPrefix.trim() || undefined,
              forcePathStyle: s3Form.forcePathStyle,
            },
          }
        : {
            name: ghForm.name.trim(),
            type: "github" as const,
            github: {
              accessToken: ghForm.accessToken.trim() || undefined,
              owner: ghForm.owner.trim(),
              repo: ghForm.repo.trim(),
              ref: ghForm.ref.trim() || undefined,
              pathPrefix: ghForm.pathPrefix.trim() || undefined,
            },
          };

    const res = await fetch("/api/storage-providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Shared Phase-2 pattern: prefer structured API codes, fall back to raw error text.
      const code = typeof body?.details?.code === "string" ? body.details.code : null;
      const segments = code ? code.split(".") : [];
      const candidate =
        segments[0] === "storageProvider" && segments[1] === "github"
          ? `${segments[1]}.${segments[2]}`
          : segments.at(-1) ?? null;
      const message =
        candidate &&
        (candidate.startsWith("github.")
          ? tErrors.has(candidate)
          : tErrors.has(candidate))
          ? tErrors(candidate)
          : body?.error ?? t("errors.generic");
      setError(message);
      return;
    }
    const { provider } = await res.json();
    setSuccess(true);
    onCreated(provider);
    toast.success(t("created", { name: provider.name }));
    setTimeout(close, 900);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Plus className="h-3.5 w-3.5" />
            {t("button")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        {/* Tab-Switch */}
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
          <TabButton
            active={tab === "s3"}
            onClick={() => setTab("s3")}
            icon={<HardDrive className="h-3.5 w-3.5" />}
            label={t("tabs.s3")}
            hint={t("tabs.s3Hint")}
          />
          <TabButton
            active={tab === "github"}
            onClick={() => setTab("github")}
            icon={<FolderGit2 className="h-3.5 w-3.5" />}
            label={t("tabs.github")}
            hint={t("tabs.githubHint")}
          />
        </div>

        <Alert>
          <AlertTitle>{t("encryptionNote")}</AlertTitle>
          <AlertDescription className="text-xs">
            {t("encryptionNote")}
          </AlertDescription>
        </Alert>

        <form onSubmit={testAndSave} className="space-y-4">
          {tab === "s3" ? (
            <>
              <Field
                label={t("fields.nameRequired")}
                value={s3Form.name}
                onChange={(v) => setS3Form({ ...s3Form, name: v })}
                placeholder={t("fields.namePlaceholderS3")}
                autoComplete="off"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("fields.bucketRequired")}
                  value={s3Form.bucket}
                  onChange={(v) => setS3Form({ ...s3Form, bucket: v })}
                  placeholder={t("fields.bucketPlaceholder")}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.regionRequired")}
                  value={s3Form.region}
                  onChange={(v) => setS3Form({ ...s3Form, region: v })}
                  placeholder={t("fields.regionPlaceholder")}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.endpoint")}
                  value={s3Form.endpoint}
                  onChange={(v) => setS3Form({ ...s3Form, endpoint: v })}
                  placeholder={t("fields.endpointPlaceholder")}
                  className="sm:col-span-2"
                  autoComplete="off"
                />
                <Field
                  label={t("fields.accessKeyIdRequired")}
                  value={s3Form.accessKeyId}
                  onChange={(v) => setS3Form({ ...s3Form, accessKeyId: v })}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.secretAccessKeyRequired")}
                  value={s3Form.secretAccessKey}
                  onChange={(v) =>
                    setS3Form({ ...s3Form, secretAccessKey: v })
                  }
                  type="password"
                  autoComplete="off"
                />
                <Field
                  label={t("fields.pathPrefix")}
                  value={s3Form.pathPrefix}
                  onChange={(v) => setS3Form({ ...s3Form, pathPrefix: v })}
                  placeholder={t("fields.pathPrefixPlaceholderS3")}
                  className="sm:col-span-2"
                  autoComplete="off"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={s3Form.forcePathStyle}
                  onChange={(e) =>
                    setS3Form({ ...s3Form, forcePathStyle: e.target.checked })
                  }
                />
                <span>{t("fields.forcePathStyle")}</span>
              </label>
            </>
          ) : (
            <>
              <Field
                label={t("fields.nameRequired")}
                value={ghForm.name}
                onChange={(v) => setGhForm({ ...ghForm, name: v })}
                placeholder={t("fields.namePlaceholderGithub")}
                autoComplete="off"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t("fields.ownerRequired")}
                  value={ghForm.owner}
                  onChange={(v) => setGhForm({ ...ghForm, owner: v })}
                  placeholder={t("fields.ownerPlaceholder")}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.repoRequired")}
                  value={ghForm.repo}
                  onChange={(v) => setGhForm({ ...ghForm, repo: v })}
                  placeholder={t("fields.repoPlaceholder")}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.ref")}
                  value={ghForm.ref}
                  onChange={(v) => setGhForm({ ...ghForm, ref: v })}
                  placeholder={t("fields.refPlaceholder")}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.pathPrefix")}
                  value={ghForm.pathPrefix}
                  onChange={(v) => setGhForm({ ...ghForm, pathPrefix: v })}
                  placeholder={t("fields.pathPrefixPlaceholderGithub")}
                  autoComplete="off"
                />
                <Field
                  label={t("fields.token")}
                  value={ghForm.accessToken}
                  onChange={(v) => setGhForm({ ...ghForm, accessToken: v })}
                  type="password"
                  autoComplete="off"
                  className="sm:col-span-2"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("githubHelpPrefix")}{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {t("patLinkLabel")}
                </a>{" "}
                {t("githubHelpSuffix")}
              </p>
            </>
          )}

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
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!valid || submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : null}
              {submitting
                ? t("submitting")
                : success
                  ? t("saved")
                  : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
        active
          ? "bg-background shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground">· {hint}</span>
    </button>
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
