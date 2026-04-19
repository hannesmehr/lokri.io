"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("settings.billing.successPage");
  const tErrors = useTranslations("errors.api.billing");
  const params = useSearchParams();
  const paypalOrderId = params.get("token"); // PayPal puts the order id in `token`
  const missingTokenError = t("errors.missingToken");
  const [phase, setPhase] = useState<Phase>("capturing");
  const [error, setError] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!paypalOrderId) {
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
        const data = await res.json().catch(() => ({ error: t("errors.captureFailed") }));
        if (cancelled) return;
        if (!res.ok) {
          const suffix =
            typeof data?.details?.code === "string"
              ? data.details.code.split(".").pop()
              : null;
          setPhase("error");
          setError(
            suffix && tErrors.has(suffix)
              ? tErrors(suffix)
              : data.error ?? t("errors.captureFailed"),
          );
          return;
        }
        setInvoiceId(data.invoice?.id ?? null);
        setPhase("success");
      } catch (err) {
        if (cancelled) return;
        setPhase("error");
        setError(err instanceof Error ? err.message : t("errors.network"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paypalOrderId, t, tErrors]);

  if (!paypalOrderId) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="mb-2 h-10 w-10 text-destructive" />
          <CardTitle>{t("errorTitle")}</CardTitle>
          <CardDescription>{missingTokenError}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-center">
          <Button
            className="w-full sm:w-auto"
            nativeButton={false}
            variant="outline"
            render={<Link href="/settings/billing">{t("backToBilling")}</Link>}
          />
          <Button
            className="w-full sm:w-auto"
            nativeButton={false}
            render={<a href="mailto:hello@lokri.io">{t("contactSupport")}</a>}
          />
        </CardContent>
      </Card>
    );
  }

  if (phase === "capturing") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-muted-foreground" />
          <CardTitle>{t("capturing.title")}</CardTitle>
          <CardDescription>
            {t("capturing.description")}
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
          <CardTitle>{t("errorTitle")}</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/settings/billing">{t("backToBilling")}</Link>}
          />
          <Button
            nativeButton={false}
            render={<a href="mailto:hello@lokri.io">{t("contactSupport")}</a>}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <CheckCircle2 className="mb-2 h-10 w-10 text-emerald-600 dark:text-emerald-400" />
        <CardTitle className="text-3xl font-semibold tracking-tight leading-tight">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("body")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
        <Button
          className="w-full sm:w-auto"
          nativeButton={false}
          render={<Link href="/dashboard">{t("backToDashboard")}</Link>}
        />
        {invoiceId ? (
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={`/api/invoices/${invoiceId}/pdf`}
                target="_blank"
                rel="noopener"
              >
                {t("openInvoice")}
              </a>
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
