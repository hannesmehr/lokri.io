"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ProfileForm({
  initialName,
  email,
  emailVerified,
}: {
  initialName: string;
  email: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);

  const dirty = name.trim() !== initialName.trim();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dirty) return;
    setLoading(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Konnte Profil nicht aktualisieren.");
      return;
    }
    toast.success("Profil aktualisiert.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={email} readOnly disabled />
        <p className="text-xs text-muted-foreground">
          {emailVerified
            ? "Email verifiziert."
            : "Email noch nicht verifiziert."}{" "}
          Email-Änderung folgt in einer späteren Version.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty || loading}>
          {loading ? "Speichere…" : "Änderungen speichern"}
        </Button>
      </div>
    </form>
  );
}
