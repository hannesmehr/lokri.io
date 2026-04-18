"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
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
import { authClient } from "@/lib/auth-client";

export function DangerZone({ userEmail }: { userEmail: string }) {
  const t = useTranslations("profile.data.accountDeletion");
  const tConfirm = useTranslations("confirmDialogs.delete");
  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const emailMatches =
    confirmEmail.trim().toLowerCase() === userEmail.toLowerCase();

  async function requestDeletion() {
    setLoading(true);
    // better-auth sends a verification email; after clicking the link, the
    // account is actually deleted via `beforeDelete`-hook cleanup in lib/auth.
    const { error } = await authClient.deleteUser({
      callbackURL: "/",
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? t("errors.generic"));
      return;
    }
    setSent(true);
  }

  function close() {
    if (loading) return;
    setOpen(false);
    setConfirmEmail("");
    setSent(false);
  }

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/15 text-destructive">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-destructive">{t("title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  {t("trigger")}
                </Button>
              }
            />
            <DialogContent>
              {sent ? (
                <>
                  <DialogHeader>
                    <DialogTitle>{t("sentTitle")}</DialogTitle>
                    <DialogDescription>
                      {t("sentDescription.before")}{" "}
                      <span className="font-medium text-foreground">
                        {userEmail}
                      </span>{" "}
                      {t("sentDescription.after")}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button onClick={close}>{t("sentConfirm")}</Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>{tConfirm("title")}</DialogTitle>
                    <DialogDescription>{t("confirmDescription")}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-muted-foreground">
                      {t("warning")}
                    </div>
                    <Label htmlFor="confirm-email">{t("confirmLabel")}</Label>
                    <Input
                      id="confirm-email"
                      type="email"
                      autoComplete="off"
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      placeholder={userEmail}
                    />
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="ghost" onClick={close} disabled={loading}>
                      {tConfirm("cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={requestDeletion}
                      disabled={!emailMatches || loading}
                    >
                      {loading ? t("submitting") : t("submit")}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
