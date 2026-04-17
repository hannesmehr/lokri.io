"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function NoteDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm("Note wirklich löschen?")) return;
    setLoading(true);
    const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Konnte Note nicht löschen.");
      return;
    }
    toast.success("Note gelöscht.");
    router.push("/notes");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={loading}>
      Löschen
    </Button>
  );
}
