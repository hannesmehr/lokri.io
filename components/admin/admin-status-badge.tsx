import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AdminStatusBadge — funktional-farbiges Status-Chip.
 *
 * Zentrale Anlaufstelle für alle Status-Signale im Admin (Verified /
 * Admin-Flag / Disabled / Revoked / Paid / Failed / Manual / Active /
 * Inactive etc.). Alle Inline-Farbkombinationen in den Explorer-Pages
 * werden dahin migriert. Laut `docs/ADMIN_DESIGN.md` ist diese
 * Komponente die **einzige** Stelle im Admin-Code, an der Tailwind-
 * Hardcoded-Farbklassen direkt erlaubt sind — alles andere läuft
 * über neutrale CSS-Var-Tokens.
 *
 * Varianten folgen der Status-Semantik:
 *   success  — emerald — gut, healthy, active, verified
 *   warning  — amber   — stale, attention-needed, inactive
 *   danger   — destructive — error, failed, disabled, revoked
 *   info     — sky     — login, info, neutral-event
 *   neutral  — muted   — default, unclassified
 *
 * `size`:
 *   "sm" (default) — `text-[10px]`, für Inline-Badges in Tabellen
 *   "md"           — `text-xs`, für prominente Status-Anzeigen
 *
 * `mono` — setzt `font-mono`, z.B. für Action-Strings aus dem Audit-Log.
 */
export type AdminBadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

interface Props {
  variant?: AdminBadgeVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<AdminBadgeVariant, string> = {
  success:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger:
    "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};

const SIZE_CLASSES: Record<"sm" | "md", string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-0.5",
  md: "text-xs px-2 py-0.5 gap-1",
};

export function AdminStatusBadge({
  variant = "neutral",
  size = "sm",
  icon,
  mono,
  className,
  children,
}: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        mono && "font-mono",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
