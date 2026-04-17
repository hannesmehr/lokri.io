"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ActiveKey {
  id: string;
  provider: "openai";
  model: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const PROVIDER_LABEL: Record<ActiveKey["provider"], string> = {
  openai: "OpenAI",
};

const MODEL_OPTIONS: Record<ActiveKey["provider"], string[]> = {
  openai: ["text-embedding-3-small", "text-embedding-ada-002"],
};

export function EmbeddingKeyManager({
  initial,
}: {
  initial: ActiveKey | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<ActiveKey | null>(initial);
  const [provider] = useState<ActiveKey["provider"]>("openai");
  const [model, setModel] = useState<string>(MODEL_OPTIONS.openai[0]);
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const valid = apiKey.trim().length >= 20 && model && provider;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    const res = await fetch("/api/embedding-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        model,
        apiKey: apiKey.trim(),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error ?? "Konnte Key nicht speichern.");
      return;
    }
    const body = await res.json();
    setCurrent({
      ...body.key,
      lastUsedAt: null,
      createdAt: body.key.createdAt,
    });
    setApiKey("");
    toast.success("Key gespeichert — ab jetzt laufen Embeddings über deinen Account.");
    router.refresh();
  }

  async function remove() {
    if (
      !confirm(
        "Key wirklich entfernen? Embeddings laufen danach wieder über die Vercel AI Gateway.",
      )
    )
      return;
    setRemoving(true);
    const res = await fetch("/api/embedding-key", { method: "DELETE" });
    setRemoving(false);
    if (!res.ok) {
      toast.error("Konnte nicht entfernen.");
      return;
    }
    setCurrent(null);
    toast.success("Key entfernt — Fallback auf Gateway aktiv.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {current ? (
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            BYOK aktiv — {PROVIDER_LABEL[current.provider]} · {current.model}
          </AlertTitle>
          <AlertDescription className="space-y-1 text-xs">
            <div>
              Hinterlegt am{" "}
              {new Date(current.createdAt).toLocaleString("de-DE")}
              {current.lastUsedAt
                ? ` · zuletzt genutzt ${new Date(current.lastUsedAt).toLocaleString("de-DE")}`
                : " · noch nicht genutzt"}
            </div>
            <div className="text-muted-foreground">
              Jede Embedding-Anfrage geht jetzt direkt an api.openai.com —
              die Vercel AI Gateway wird übersprungen.
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Kein Key hinterlegt — Gateway-Fallback aktiv
          </AlertTitle>
          <AlertDescription className="text-xs">
            Embeddings werden aktuell über die Vercel AI Gateway geroutet
            (`openai/text-embedding-3-small`). Lege unten einen eigenen Key
            an, wenn du die Gateway-Kosten umgehen oder eine saubere
            Audit-Spur bei deinem OpenAI-Account willst.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm text-muted-foreground">
              OpenAI
              <Badge variant="secondary" className="ml-2 text-[10px]">
                nur OpenAI für v1
              </Badge>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="model-select">
              Modell *
            </Label>
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {MODEL_OPTIONS[provider].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Beide Modelle emittieren 1536-dim Vektoren — Pflicht für unsere
              pgvector-Spalte.
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="api-key-input">
            OpenAI API-Key *
          </Label>
          <Input
            id="api-key-input"
            type="password"
            autoComplete="off"
            value={apiKey}
            placeholder="sk-..."
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Der Key wird AES-256-GCM-verschlüsselt in der DB abgelegt und
            niemals wieder im Klartext zurückgegeben. Wir testen die Verbindung
            vor dem Speichern — ungültige Keys werden nicht persistiert.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!valid || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting
              ? "Teste Verbindung…"
              : current
                ? "Key ersetzen"
                : "Testen & Speichern"}
          </Button>
          {current ? (
            <Button
              type="button"
              variant="outline"
              onClick={remove}
              disabled={removing}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Key entfernen
            </Button>
          ) : null}
        </div>
      </form>

      <Alert variant="default" className="border-amber-500/30 bg-amber-500/5">
        <AlertTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Achtung bei Modellwechsel
        </AlertTitle>
        <AlertDescription className="text-xs">
          Ein Wechsel von <code>text-embedding-3-small</code> zu{" "}
          <code>text-embedding-ada-002</code> (oder zurück) lässt bestehende
          Vektoren im Raum inkompatibel — neue Queries landen in einem anderen
          Embedding-Space als alte Chunks. Für sauberen Betrieb: nach einem
          Modellwechsel alle Spaces einmal{" "}
          <em>Neu indizieren</em> lassen.
        </AlertDescription>
      </Alert>
    </div>
  );
}
