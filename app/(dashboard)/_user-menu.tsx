"use client";

import {
  ChevronDown,
  CreditCard,
  LogOut,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";

interface Props {
  user: { name: string; email: string };
  /** When true, the backoffice shortcut appears at the top of the menu. */
  isAdmin?: boolean;
}

export function UserMenu({ user, isAdmin = false }: Props) {
  const router = useRouter();
  const t = useTranslations("common.userMenu");
  const initials =
    user.name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || user.email[0]?.toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-9 items-center gap-1.5 rounded-full border bg-background pl-1 pr-2 text-sm transition-colors hover:bg-muted"
            aria-label="User-Menü"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
              {initials}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {user.email}
          </div>
        </div>
        <DropdownMenuSeparator />
        {/* Admin-Entry: nur für User mit is_admin-Flag. Absichtlich
            deutsch + Shield-Icon, damit der Schritt zwischen Alltag
            und Backoffice visuell gemarkert ist. */}
        {isAdmin ? (
          <>
            <DropdownMenuItem render={<Link href="/admin" />}>
              <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="text-amber-700 dark:text-amber-300">
                Admin-Bereich
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem render={<Link href="/profile" />}>
          <User className="h-4 w-4" />
          {t("profile")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings/billing" />}>
          <CreditCard className="h-4 w-4" />
          {t("billing")}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="h-4 w-4" />
          {t("settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
