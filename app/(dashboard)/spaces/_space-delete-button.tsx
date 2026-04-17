"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SpaceDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm(`Space "${name}" wirklich löschen? Notes und Files werden dadurch "unsortiert".`))
      return;
    setLoading(true);
    const res = await fetch(`/api/spaces/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Konnte Space nicht löschen.");
      return;
    }
    toast.success("Space gelöscht.");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={loading}>
      Löschen
    </Button>
  );
}
