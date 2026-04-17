"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        "relative rounded-md px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active ? (
        <span className="absolute inset-x-2.5 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
      ) : null}
    </Link>
  );
}
