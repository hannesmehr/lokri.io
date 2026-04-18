import { Check, FolderPlus, Plug, StickyNote } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  description: string;
  href: string;
  cta: string;
  icon: React.ReactNode;
  done: boolean;
}

interface Props {
  hasSpace: boolean;
  hasNote: boolean;
  hasToken: boolean;
}

/**
 * First-run walkthrough — derived purely from DB state (spaces.length,
 * notes.length, api_tokens.length). As soon as a user has completed all
 * three steps the card disappears; no persistent flag needed.
 *
 * Phase-1-Redesign: Gradient-Hintergrund und Emerald-/Indigo-Akzente
 * entfernt; Done-State wird über Opacity + Check-Icon signalisiert,
 * Active-State über einen subtilen Ring um den nächsten offenen Schritt.
 */
export async function OnboardingCard({ hasSpace, hasNote, hasToken }: Props) {
  const t = await getTranslations("dashboard.onboarding");
  if (hasSpace && hasNote && hasToken) return null;

  const steps: Step[] = [
    {
      label: t("steps.space.label"),
      description: t("steps.space.description"),
      href: "/spaces",
      cta: t("steps.space.cta"),
      icon: <FolderPlus className="h-4 w-4" />,
      done: hasSpace,
    },
    {
      label: t("steps.note.label"),
      description: t("steps.note.description"),
      href: "/notes/new",
      cta: t("steps.note.cta"),
      icon: <StickyNote className="h-4 w-4" />,
      done: hasNote,
    },
    {
      label: t("steps.client.label"),
      description: t("steps.client.description"),
      href: "/settings",
      cta: t("steps.client.cta"),
      icon: <Plug className="h-4 w-4" />,
      done: hasToken,
    },
  ];
  const completed = steps.filter((s) => s.done).length;
  const nextStep = steps.findIndex((s) => !s.done);

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("progress", { completed, total: steps.length })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => (
            <span
              key={i}
              className={cn(
                "grid h-6 w-6 place-items-center rounded-full border text-[10px] font-semibold tabular-nums",
                s.done
                  ? "border-foreground/30 bg-foreground text-background"
                  : i === nextStep
                    ? "border-foreground/40 text-foreground"
                    : "border-border bg-muted text-muted-foreground",
              )}
              aria-label={
                s.done
                  ? t("stepStatus.done", { step: i + 1 })
                  : t("stepStatus.open", { step: i + 1 })
              }
            >
              {s.done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
          ))}
        </div>
      </header>
      <div className="grid gap-2 p-2 md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={cn(
              "rounded-md border p-3 transition-colors",
              s.done
                ? "border-transparent bg-muted/30 opacity-70"
                : i === nextStep
                  ? "border-foreground/20"
                  : "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground">
                {s.done ? <Check className="h-3.5 w-3.5" /> : s.icon}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("stepLabel", { step: i + 1 })}
              </span>
            </div>
            <div className="mt-2 text-sm font-medium">{s.label}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {s.description}
            </p>
            {!s.done ? (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={s.href}>{s.cta} →</Link>}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
