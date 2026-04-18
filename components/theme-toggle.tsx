"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Theme-Toggle nach shadcn-Standard.
 *
 * Button zeigt Sun im Light und Moon im Dark — per CSS-Transition
 * gekreuzt (Icon absolut positioniert, Größe/Rotation je nach
 * `.dark`-Variant). Damit kein Layout-Shift und keine Re-Render-
 * Flicker. DropdownMenu bietet explizit Light / Dark / System —
 * nicht nur Toggle, damit der User zurück auf „System" kann.
 *
 * Der `render`-Prop-Pattern am `DropdownMenuTrigger` ist Projekt-
 * Standard (siehe `_user-menu.tsx`, `_account-switcher.tsx`): der
 * Trigger ist self-closing, der gesamte Button-Content lebt in der
 * `render`-Prop, nicht als Children.
 *
 * `variant`:
 *   - `"icon"` (Default) → 36×36 Icon-Only-Button für die Top-Nav
 *   - `"full"` → Label + Icon, passt in Sidebar-Footer
 */
interface Props {
  variant?: "icon" | "full";
  className?: string;
}

export function ThemeToggle({ variant = "icon", className }: Props) {
  const { setTheme, theme } = useTheme();

  if (variant === "full") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                className,
              )}
            >
              <ThemeIcon />
              <span>
                {theme === "dark"
                  ? "Dark"
                  : theme === "light"
                    ? "Light"
                    : "System"}
              </span>
              <span className="sr-only">Theme wechseln</span>
            </button>
          }
        />
        <DropdownMenuContent align="start" side="top" className="min-w-[8rem]">
          <MenuItems setTheme={setTheme} />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Theme wechseln"
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              className,
            )}
          >
            <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
            <span className="sr-only">Theme wechseln</span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        <MenuItems setTheme={setTheme} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Shared Menu-Items für beide Varianten. */
function MenuItems({ setTheme }: { setTheme: (t: string) => void }) {
  return (
    <>
      <DropdownMenuItem onClick={() => setTheme("light")}>
        <Sun className="h-4 w-4" />
        Light
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme("dark")}>
        <Moon className="h-4 w-4" />
        Dark
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme("system")}>
        <Laptop className="h-4 w-4" />
        System
      </DropdownMenuItem>
    </>
  );
}

/** Aktuell-aktives-Theme-Icon für den Full-Variant (crossfade via .dark). */
function ThemeIcon() {
  return (
    <span className="relative inline-flex h-4 w-4 items-center justify-center">
      <Sun className="absolute h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </span>
  );
}
