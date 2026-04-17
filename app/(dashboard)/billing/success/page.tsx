"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

type Phase = "capturing" | "success" | "error";

function Inner() {
  const params = useSearchParams();
  const paypalOrderId = params.get("token"); // PayPal puts the order id in `token`
  const [phase, setPhase] = useState<Phase>("capturing");
  const [error, setError] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!paypalOrderId) {
      setPhase("error");
      setError("PayPal hat keinen Order-Token mitgeliefert.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/paypal/capture-order", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paypalOrderId }),
        });
        const data = await res.json().catch(() => ({ error: "Fehler" }));
        if (cancelled) return;
        if (!res.ok) {
          setPhase("error");
          setError(data.error ?? `Capture fehlgeschlagen (${res.status})`);
          return;
        }
        setInvoiceId(data.invoice?.id ?? null);
        setPhase("success");
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : "Netzwerkfehler");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paypalOrderId]);

  if (phase === "capturing") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
          <CardTitle>Zahlung wird bestätigt…</CardTitle>
          <CardDescription>
            Wir holen die Bestätigung von PayPal und aktivieren deinen Plan.
            Das dauert in der Regel 1–3 Sekunden.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="mb-2 h-10 w-10 text-destructive" />
          <CardTitle>Etwas ist schiefgelaufen</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/billing">Zurück zu Billing</Link>}
          />
          <Button
            nativeButton={false}
            render={<a href="mailto:hello@lokri.io">Support anschreiben</a>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-background to-teal-500/5">
      <CardHeader className="items-center text-center">
        <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        <CardTitle className="font-display text-3xl leading-tight">
          Zahlung bestätigt
        </CardTitle>
        <CardDescription>
          Dein Plan ist aktiv. Eine Rechnung liegt im Profil zum Download
          bereit.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-center gap-2">
        <Button
          nativeButton={false}
          render={<Link href="/dashboard">Zum Dashboard</Link>}
        />
        {invoiceId ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={`/api/invoices/${invoiceId}/pdf`}
                target="_blank"
                rel="noopener"
              >
                Rechnung öffnen
              </a>
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
