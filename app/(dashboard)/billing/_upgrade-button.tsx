"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("billing.errors");
  const tButton = useTranslations("billing.upgradeButton");
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
      const data = await res.json().catch(() => ({ error: t("createOrderFailed") }));
      toast.error(data.error ?? t("createOrderFailed"));
      return;
    }
    const data: { approveUrl: string | null } = await res.json();
    if (!data.approveUrl) {
      setLoading(false);
      toast.error(t("noApproveUrl"));
      return;
    }
    window.location.href = data.approveUrl;
  }

  return (
    <Button onClick={go} disabled={loading} className={className}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? tButton("opening") : label}
    </Button>
  );
}
