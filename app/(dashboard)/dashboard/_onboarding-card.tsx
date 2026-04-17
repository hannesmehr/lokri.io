import { Check, FolderPlus, Plug, StickyNote } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
 * notes.length, api_tokens.length). As soon as a user has completed all three
 * steps the card disappears; no persistent flag needed.
 */
export function OnboardingCard({ hasSpace, hasNote, hasToken }: Props) {
  if (hasSpace && hasNote && hasToken) return null;

  const steps: Step[] = [
    {
      label: "Space anlegen",
      description: "Gruppiert Notes und Files thematisch. Optional, aber hilft beim Sortieren.",
      href: "/spaces",
      cta: "Zu Spaces",
      icon: <FolderPlus className="h-4 w-4" />,
      done: hasSpace,
    },
    {
      label: "Erste Note",
      description: "Markdown-Text, wird automatisch für die semantische Suche indiziert.",
      href: "/notes/new",
      cta: "Note schreiben",
      icon: <StickyNote className="h-4 w-4" />,
      done: hasNote,
    },
    {
      label: "KI-Client verbinden",
      description: "Generiere einen MCP-Token und trag ihn in Claude Desktop, ChatGPT oder Cursor ein.",
      href: "/settings",
      cta: "MCP einrichten",
      icon: <Plug className="h-4 w-4" />,
      done: hasToken,
    },
  ];
  const completed = steps.filter((s) => s.done).length;

  return (
    <Card className="overflow-hidden border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 via-background to-fuchsia-500/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="font-display text-2xl font-normal">
              Erste Schritte
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              In 3 Minuten von Null zu produktiv. Du bist bei{" "}
              <strong className="text-foreground">{completed}/3</strong>.
            </p>
          </div>
          <div className="flex -space-x-1">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`grid h-7 w-7 place-items-center rounded-full border-2 border-background text-xs font-semibold ${
                  s.done
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.label}
            className={`rounded-lg border bg-card/60 p-4 backdrop-blur-sm ${
              s.done ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`grid h-7 w-7 place-items-center rounded-md ${
                  s.done
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                }`}
              >
                {s.done ? <Check className="h-4 w-4" /> : s.icon}
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Schritt {i + 1}
              </span>
            </div>
            <div className="mt-2 font-medium">{s.label}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {s.description}
            </p>
            {!s.done && (
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={s.href}>{s.cta} →</Link>}
                />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
