"use client";

import { AlertTriangle } from "lucide-react";
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
      toast.error(error.message ?? "Löschung fehlgeschlagen.");
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
            <h3 className="font-semibold text-destructive">Account löschen</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanent und irreversibel. Alle Spaces, Notes, Files, Tokens und
              OAuth-Consents werden gelöscht. Wir schicken dir einen Bestätigungs-Link
              per Email.
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  Account löschen…
                </Button>
              }
            />
            <DialogContent>
              {sent ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Check deine Mails</DialogTitle>
                    <DialogDescription>
                      Wir haben an{" "}
                      <span className="font-medium text-foreground">
                        {userEmail}
                      </span>{" "}
                      einen Bestätigungs-Link geschickt. Erst nach dem Klick auf
                      den Link wird dein Account gelöscht.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button onClick={close}>Verstanden</Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Account endgültig löschen?</DialogTitle>
                    <DialogDescription>
                      Diese Aktion kann nicht rückgängig gemacht werden. Gib
                      zur Bestätigung deine Email ein.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-email">
                      Email zur Bestätigung
                    </Label>
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
                      Abbrechen
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={requestDeletion}
                      disabled={!emailMatches || loading}
                    >
                      {loading
                        ? "Sende Bestätigungs-Link…"
                        : "Bestätigungs-Link anfordern"}
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
