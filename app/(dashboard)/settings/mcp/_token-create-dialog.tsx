"use client";

import { useRouter } from "next/navigation";
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

export function TokenCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Konnte Token nicht erstellen.");
      return;
    }
    const { token } = await res.json();
    setPlaintext(token.plaintext);
    router.refresh();
  }

  function closeAndReset() {
    setOpen(false);
    setPlaintext(null);
    setName("");
  }

  function copyToClipboard() {
    if (!plaintext) return;
    void navigator.clipboard.writeText(plaintext);
    toast.success("Token kopiert.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) closeAndReset();
        else setOpen(true);
      }}
    >
      <DialogTrigger render={<Button>Neuer Token</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {plaintext ? "Token erstellt" : "Neuer MCP-Token"}
          </DialogTitle>
          <DialogDescription>
            {plaintext
              ? "Kopiere den Token jetzt — er wird danach nicht mehr angezeigt."
              : "Gib dem Token einen wiedererkennbaren Namen (z.B. den Client)."}
          </DialogDescription>
        </DialogHeader>

        {plaintext ? (
          <div className="space-y-4">
            <Alert>
              <AlertTitle>Nur einmal sichtbar</AlertTitle>
              <AlertDescription>
                Nach dem Schließen kann dieser Token nicht erneut angezeigt
                werden. Speichere ihn in deiner KI-Client-Konfiguration oder
                einem Passwortmanager.
              </AlertDescription>
            </Alert>
            <pre className="rounded-md border bg-muted/50 p-3 text-xs break-all whitespace-pre-wrap">
              {plaintext}
            </pre>
            <DialogFooter className="gap-2">
              <Button type="button" onClick={copyToClipboard}>
                In Zwischenablage kopieren
              </Button>
              <Button type="button" variant="outline" onClick={closeAndReset}>
                Schließen
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                required
                maxLength={100}
                placeholder="z.B. Claude Desktop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading || !name}>
                {loading ? "Erstellen…" : "Token erstellen"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
