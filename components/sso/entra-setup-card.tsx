"use client";

import { ChevronDown, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function EntraSetupCard({
  title,
  description,
  callbackLabel,
  callbackUrl,
  supportedAccountTypesLabel,
  supportedAccountTypesValue,
  clientIdLabel,
  clientId,
  copyLabel,
  copiedLabel,
}: {
  title: string;
  description: string;
  callbackLabel: string;
  callbackUrl: string;
  supportedAccountTypesLabel: string;
  supportedAccountTypesValue: string;
  clientIdLabel: string;
  clientId: string | null;
  copyLabel: string;
  copiedLabel: string;
}) {
  async function copyCallbackUrl() {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      toast.success(copiedLabel);
    } catch {
      toast.error(copyLabel);
    }
  }

  return (
    <details className="rounded-lg border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {callbackLabel}
          </p>
          <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
            <code className="break-all font-mono text-xs text-muted-foreground">
              {callbackUrl}
            </code>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyCallbackUrl}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                {copyLabel}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5 rounded-md border bg-background p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {supportedAccountTypesLabel}
            </p>
            <p className="text-sm">{supportedAccountTypesValue}</p>
          </div>
          <div className="space-y-1.5 rounded-md border bg-background p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {clientIdLabel}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{clientId ?? "—"}</p>
          </div>
        </div>
      </div>
    </details>
  );
}
