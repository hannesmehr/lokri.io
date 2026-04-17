"use client";

import { ChevronDown, CreditCard, LogOut, Settings, User } from "lucide-react";
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
}

export function UserMenu({ user }: Props) {
  const router = useRouter();
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
            className="flex items-center gap-1.5 rounded-full border bg-background px-1 py-1 text-sm transition-colors hover:bg-muted"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[10px] font-semibold text-white">
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
        <DropdownMenuItem render={<Link href="/profile" />}>
          <User className="h-4 w-4" />
          Profil
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/billing" />}>
          <CreditCard className="h-4 w-4" />
          Billing
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="h-4 w-4" />
          Einstellungen
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
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
