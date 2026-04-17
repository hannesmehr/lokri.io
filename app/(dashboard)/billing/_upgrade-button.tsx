"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  planId: string;
  period: "monthly" | "yearly";
  label: string;
  className?: string;
}

/**
 * Creates a PayPal order on click, then redirects the browser to PayPal's
 * approve URL. On return, `/billing/success` captures the order.
 */
export function UpgradeButton({ planId, period, label, className }: Props) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    const res = await fetch("/api/paypal/create-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId, period }),
    });
    if (!res.ok) {
      setLoading(false);
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error ?? "PayPal-Bestellung fehlgeschlagen.");
      return;
    }
    const data: { approveUrl: string | null } = await res.json();
    if (!data.approveUrl) {
      setLoading(false);
      toast.error("Keine Weiterleitungs-URL von PayPal erhalten.");
      return;
    }
    window.location.href = data.approveUrl;
  }

  return (
    <Button onClick={go} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? "Öffne PayPal…" : label}
    </Button>
  );
}
