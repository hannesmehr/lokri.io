"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TeamDeleteCard({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const router = useRouter();
  const tDel = useTranslations("team.danger");
  const tConfirm = useTranslations("confirmDialogs.delete");
  const tTeamErrors = useTranslations("errors.api.team");
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm !== teamName) {
      toast.error(tDel("mismatch"));
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/teams/${teamId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmName: confirm }),
    });
    if (!res.ok) {
      setBusy(false);
      const body = await res.json().catch(() => ({}));
      const suffix = body?.details?.code
        ? String(body.details.code).split(".").pop()
        : null;
      const message =
        suffix && tTeamErrors.has(suffix)
          ? tTeamErrors(suffix)
          : body?.error ?? tDel("mismatch");
      toast.error(message);
      return;
    }
    toast.success(tDel("success"));
    setOpen(false);
    // Active account is now invalid → server will fall back to personal
    // on next render. Full reload to avoid a stale layout frame.
    window.location.href = "/dashboard";
    void router;
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {tDel("eyebrow")}
          </CardTitle>
          <CardDescription>{tDel("dangerDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{tDel("intro")}</p>
            <p>{tDel("storageHint")}</p>
          </div>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            {tDel("button")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : setOpen(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tConfirm("title")}</DialogTitle>
            <DialogDescription>
              {tDel("confirmDescription", { name: teamName })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
              {tDel("warning")}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-name">
                {tDel("confirmPrompt", { name: teamName })}
              </Label>
              <Input
                id="confirm-name"
                autoComplete="off"
                autoFocus
                placeholder={tDel("confirmPlaceholder")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                {tConfirm("cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={busy || confirm !== teamName}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy ? tDel("submitting") : tDel("submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
