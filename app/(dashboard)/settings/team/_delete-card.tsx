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
  const tOv = useTranslations("settings.team.overview");
  const tDel = useTranslations("settings.team.delete");
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
      const code = body?.details?.code;
      toast.error(code === "NAME_MISMATCH" ? tDel("mismatch") : (body?.error ?? tDel("mismatch")));
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
            {tOv("dangerTitle")}
          </CardTitle>
          <CardDescription>{tOv("dangerDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setOpen(true)}>
            {tDel("button")}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : setOpen(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tDel("title", { name: teamName })}</DialogTitle>
            <DialogDescription>{tDel("intro")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
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
