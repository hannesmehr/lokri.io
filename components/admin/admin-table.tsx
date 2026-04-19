import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AdminTable — Shell für dichte Explorer-Tabellen.
 *
 * Ersetzt die 5× wiederholte Struktur (Users/Accounts/Invoices/Tokens/
 * Audit) aus Wrapper-Div + `<table>` + Thead mit `bg-muted/40` + Tbody
 * mit `divide-y`. Rows + Cells rendert jede Explorer-Page weiterhin
 * inline, weil der JSX pro Zeile stark variiert (verschachtelte Badges,
 * Inline-Toggles, komplexe Action-Buttons).
 *
 * Sub-Komponenten `<AdminTableEmpty>` und `<AdminTableLoading>`
 * rendern standardisiert eine `<tr>` mit `colSpan`-covering Content —
 * sie bekommen den Spalten-Count, weil sie ihn sonst nicht kennen.
 *
 * Keine Sort/Filter-Logik hier drin — die bleibt Page-spezifisch
 * (siehe `docs/ADMIN_DESIGN.md` → Komponenten-Inventar).
 */
interface TableProps {
  children: ReactNode;
  className?: string;
}

export function AdminTable({ children, className }: TableProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border bg-card",
        className,
      )}
    >
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function AdminTableHead({ children, className }: TableProps) {
  return (
    <thead
      className={cn(
        "bg-muted/40 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </thead>
  );
}

export function AdminTableBody({ children, className }: TableProps) {
  return <tbody className={cn("divide-y", className)}>{children}</tbody>;
}

/** Standard-Cell-Paddings für Thead-Cells. */
export function AdminTh({
  children,
  className,
  align = "left",
}: TableProps & { align?: "left" | "right" | "center" }) {
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        align === "right" && "text-right",
        align === "left" && "text-left",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Standard-Cell-Paddings für Tbody-Cells. */
export function AdminTd({
  children,
  className,
  align = "left",
}: TableProps & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "px-3 py-2",
        align === "right" && "text-right",
        align === "left" && "text-left",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

interface StateRowProps {
  colSpan: number;
  children?: ReactNode;
}

export function AdminTableEmpty({ colSpan, children }: StateRowProps) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-8 text-center text-sm text-muted-foreground"
      >
        {children ?? "Keine Einträge."}
      </td>
    </tr>
  );
}

export function AdminTableLoading({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center">
        <Loader2
          aria-label="Lädt"
          className="mx-auto h-4 w-4 animate-spin text-muted-foreground"
        />
      </td>
    </tr>
  );
}
