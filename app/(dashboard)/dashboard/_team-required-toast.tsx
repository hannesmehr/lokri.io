"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Triggert einen Toast, wenn der User per `requireTeamAccount()`-Guard
 * von einer `/team/*`-Route weggeredirectet wurde (Query-Param
 * `?teamRequired=1`).
 *
 * Nach dem Fire: `router.replace("/dashboard")` scheibt den Param aus
 * der URL — damit ein Refresh nicht nochmal den Toast feuert und der
 * Query-Param nicht im Browser-Verlauf bleibt (beides Security-Review-
 * Punkte aus dem Master-Prompt Block 3).
 *
 * `useRef`-Guard verhindert React-StrictMode-Double-Toast.
 */
export function TeamRequiredToast() {
  const router = useRouter();
  const t = useTranslations("team.redirects");
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast.info(t("teamRequired"));
    router.replace("/dashboard");
  }, [router, t]);

  return null;
}
