"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  spaceId: string;
}

interface Summary {
  total: number;
  indexed: number;
  noText: number;
  failed: number;
  chunks: number;
  truncated: boolean;
}

/**
 * Kicks off a bulk re-extract + re-embed for all files in the space.
 * Lives on the Server-Component page as a small client island so the
 * whole page stays static.
 */
export function ReindexSpaceButton({ spaceId }: Props) {
  const t = useTranslations("spaces.detail.reindex");
  const tToasts = useTranslations("toasts");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (
      !confirm(t("confirm"))
    ) {
      return;
    }
    setLoading(true);
    const toastId = toast.loading(t("loading"));
    try {
      const res = await fetch(`/api/spaces/${spaceId}/reindex`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        toast.error(body.error ?? tToasts("error.generic"), { id: toastId });
        return;
      }
      const { summary } = (await res.json()) as { summary: Summary };
      const msg =
        summary.noText > 0 || summary.failed > 0
          ? t("partial", {
              indexed: summary.indexed,
              noText: summary.noText,
              failed: summary.failed,
            })
          : t("success", {
              indexed: summary.indexed,
              chunks: summary.chunks,
            });
      if (summary.truncated) {
        toast.warning(`${msg} — ${t("truncated")}`, {
          id: toastId,
        });
      } else if (summary.failed > 0) {
        toast.warning(msg, { id: toastId });
      } else {
        toast.success(msg, { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToasts("error.networkFailed"), {
        id: toastId,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={run}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      {loading ? t("working") : t("button")}
    </Button>
  );
}
