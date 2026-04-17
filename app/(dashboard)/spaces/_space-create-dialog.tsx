"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";

interface Provider {
  id: string;
  name: string;
}

export function SpaceCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [storageProviderId, setStorageProviderId] = useState<string>("");
  const [providers, setProviders] = useState<Provider[]>([]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/storage-providers")
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d: { providers: Provider[] }) => setProviders(d.providers ?? []));
  }, [open]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/spaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        storageProviderId: storageProviderId || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Konnte Space nicht anlegen.");
      return;
    }
    toast.success("Space angelegt.");
    setName("");
    setDescription("");
    setStorageProviderId("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Neuer Space</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Space</DialogTitle>
          <DialogDescription>
            Gruppiere Notes und Files. Optional: einen eigenen Storage-Provider
            zuweisen — dann landen Uploads dieses Spaces in deinem Bucket.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung (optional)</Label>
            <Textarea
              id="description"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider">Storage</Label>
            <select
              id="provider"
              className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
              value={storageProviderId}
              onChange={(e) => setStorageProviderId(e.target.value)}
            >
              <option value="">lokri-managed (Standard)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {providers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Keine externen Provider. Leg einen in{" "}
                <Link
                  href="/settings/storage"
                  className="underline underline-offset-4"
                >
                  Settings → Storage
                </Link>{" "}
                an.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Anlegen…" : "Anlegen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
