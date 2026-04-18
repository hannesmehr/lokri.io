"use client";

import {
  Check,
  ChevronDown,
  Loader2,
  Plus,
  Settings,
  User,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Account {
  id: string;
  name: string;
  type: "personal" | "team";
  role: "owner" | "admin" | "member" | "viewer" | "editor" | "reader";
  planId: string;
}

interface Props {
  activeAccountId: string;
  activeAccountType: "personal" | "team";
  activeAccountName: string;
  canCreateTeams: boolean;
}

/**
 * Account switcher lives in the dashboard header, left of the user menu.
 * Loads the account list lazily on first click — no cost if the user
 * never opens it.
 */
export function AccountSwitcher({
  activeAccountId,
  activeAccountType,
  activeAccountName,
  canCreateTeams,
}: Props) {
  const router = useRouter();
  const t = useTranslations("accountSwitcher");
  const tRoles = useTranslations("enums.role");
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!open || accounts) return;
    let cancelled = false;
    void fetch("/api/accounts").then(async (r) => {
      if (!r.ok || cancelled) return;
      const body = (await r.json()) as { accounts: Account[] };
      if (!cancelled) setAccounts(body.accounts);
    });
    return () => {
      cancelled = true;
    };
  }, [open, accounts]);

  async function switchTo(id: string) {
    if (id === activeAccountId) return;
    setSwitching(id);
    const res = await fetch("/api/accounts/active", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerAccountId: id }),
    });
    if (!res.ok) {
      setSwitching(null);
      toast.error(t("switchError"));
      return;
    }
    // Invalidate the server-rendered chrome (nav, metadata, session ctx).
    router.refresh();
    setOpen(false);
    setTimeout(() => setSwitching(null), 300);
  }

  const TriggerIcon = activeAccountType === "team" ? Users : User;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={t("trigger")}
              className="flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <TriggerIcon className="h-3.5 w-3.5" />
              <span className="max-w-[90px] truncate font-medium text-foreground sm:max-w-[140px]">
                {activeAccountName}
              </span>
              <span className="hidden shrink-0 rounded border px-1 py-0.5 text-[9px] uppercase tracking-wide sm:inline">
                {activeAccountType === "team"
                  ? t("teamBadge")
                  : t("personalBadge")}
              </span>
              <ChevronDown className="h-3 w-3" />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-64">
          {accounts === null ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              …
            </div>
          ) : (
            accounts.map((a) => {
              const isActive = a.id === activeAccountId;
              const Icon = a.type === "team" ? Users : User;
              return (
                <DropdownMenuItem
                  key={a.id}
                  onClick={() => void switchTo(a.id)}
                  disabled={!!switching}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {tRoles(a.role)}
                  </span>
                  {switching === a.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isActive ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : null}
                </DropdownMenuItem>
              );
            })
          )}
          {canCreateTeams || activeAccountType === "team" ? (
            <DropdownMenuSeparator />
          ) : null}
          {canCreateTeams ? (
            <DropdownMenuItem onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("createTeam")}
            </DropdownMenuItem>
          ) : null}
          {activeAccountType === "team" ? (
            <DropdownMenuItem render={<Link href="/settings/team" />}>
              <Settings className="h-3.5 w-3.5" />
              {t("teamSettings")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateTeamDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={() => router.refresh()}
      />
    </>
  );
}

function CreateTeamDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const t = useTranslations("accountSwitcher.createDialog");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const code = (body?.details?.code as string | undefined) ?? "";
      toast.error(
        code === "CREATE_DISABLED" ? t("errors.disabled") : t("errors.generic"),
      );
      return;
    }
    onOpenChange(false);
    setName("");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">{t("name")}</Label>
            <Input
              id="team-name"
              required
              maxLength={200}
              autoFocus
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
