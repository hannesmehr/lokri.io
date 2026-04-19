"use client";

import {
  Loader2,
  MoreHorizontal,
  Trash2,
  UserCog,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { formatDate } from "@/lib/i18n/formatters";
import type { Locale } from "@/lib/i18n/config";

const TRANSFER_SENTINEL = "__transfer__";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

function memberInitials(member: Member) {
  const source = member.name?.trim() || member.email.trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function errorSuffix(code: unknown) {
  return typeof code === "string" ? code.split(".").pop() ?? null : null;
}

export function MembersTable({
  teamId,
  members,
  currentUserId,
  currentUserRole,
  canManage,
}: {
  teamId: string;
  members: Member[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member" | "viewer";
  canManage: boolean;
}) {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("team.members");
  const tOwnership = useTranslations("team.ownership");
  const tRoles = useTranslations("enums.role");
  const tErrors = useTranslations("errors.api.team");
  const [busy, setBusy] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);

  const sortedMembers = [...members].sort((a, b) => {
    if (a.role === "owner") return -1;
    if (b.role === "owner") return 1;
    return a.name.localeCompare(b.name);
  });

  function resolveErrorMessage(
    body: { error?: string; details?: { code?: string } } | null | undefined,
    fallback: string,
  ) {
    const suffix = errorSuffix(body?.details?.code);
    return suffix && tErrors.has(suffix)
      ? tErrors(suffix)
      : body?.error ?? fallback;
  }

  async function changeRole(userId: string, nextRole: string) {
    setBusy(userId);
    const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(resolveErrorMessage(body, t("errors.roleChangeFailed")));
      return;
    }
    toast.success(t("roleChanged"));
    router.refresh();
  }

  function handleRoleSelect(member: Member, next: string) {
    if (next === TRANSFER_SENTINEL) {
      setTransferTarget(member);
      return;
    }
    void changeRole(member.userId, next);
  }

  async function confirmTransfer() {
    if (!transferTarget) return;
    setBusy(transferTarget.userId);
    const res = await fetch(`/api/teams/${teamId}/transfer-ownership`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newOwnerUserId: transferTarget.userId }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(resolveErrorMessage(body, tOwnership("errors.generic")));
      return;
    }
    const target = transferTarget;
    setTransferTarget(null);
    toast.success(
      tOwnership("success", { userName: target.name || target.email }),
    );
    router.refresh();
  }

  async function remove(member: Member) {
    if (!confirm(t("removeConfirm", { name: member.name || member.email }))) {
      return;
    }
    setBusy(member.userId);
    const res = await fetch(`/api/teams/${teamId}/members/${member.userId}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(resolveErrorMessage(body, t("errors.removeFailed")));
      return;
    }
    toast.success(t("removed"));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowInvite(true)}>
            {t("inviteButton")}
          </Button>
        </div>
      ) : null}

      <div className="space-y-3 md:hidden">
        {sortedMembers.map((member) => {
          const isSelf = member.userId === currentUserId;
          const isOwner = member.role === "owner";
          const canChangeThisRole = canManage && !isSelf && !isOwner;
          return (
            <div key={member.userId} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium">
                    {memberInitials(member)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {member.name || member.email}
                      </p>
                      {isSelf ? (
                        <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t("selfBadge")}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {member.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("joinedAt", { date: formatDate(member.joinedAt, locale) })}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p className="font-medium">{tRoles(member.role)}</p>
                  {isOwner ? (
                    <p className="text-muted-foreground">{t("ownerLabel")}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {canChangeThisRole ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleSelect(member, e.target.value)}
                    disabled={busy === member.userId}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="admin">{tRoles("admin")}</option>
                    <option value="member">{tRoles("member")}</option>
                    <option value="viewer">{tRoles("viewer")}</option>
                    {currentUserRole === "owner" && member.role === "admin" ? (
                      <option value={TRANSFER_SENTINEL}>
                        {tOwnership("menuItem")}
                      </option>
                    ) : null}
                  </select>
                ) : null}
                {canManage && !isSelf && !isOwner ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === member.userId}
                    onClick={() => void remove(member)}
                    className="justify-start"
                  >
                    {busy === member.userId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    {t("remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-xl border md:block">
        <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>{t("table.member")}</span>
          <span>{t("table.role")}</span>
          <span>{t("table.joined")}</span>
          <span className="text-right">{t("table.actions")}</span>
        </div>
        {sortedMembers.map((member) => {
          const isSelf = member.userId === currentUserId;
          const isOwner = member.role === "owner";
          const canChangeThisRole = canManage && !isSelf && !isOwner;
          return (
            <div
              key={member.userId}
              className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:border-foreground/20"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium">
                  {memberInitials(member)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">
                      {member.name || member.email}
                    </p>
                    {isSelf ? (
                      <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("selfBadge")}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {member.email}
                  </p>
                </div>
              </div>

              <div>
                {canChangeThisRole ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleSelect(member, e.target.value)}
                    disabled={busy === member.userId}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="admin">{tRoles("admin")}</option>
                    <option value="member">{tRoles("member")}</option>
                    <option value="viewer">{tRoles("viewer")}</option>
                    {currentUserRole === "owner" && member.role === "admin" ? (
                      <option value={TRANSFER_SENTINEL}>
                        {tOwnership("menuItem")}
                      </option>
                    ) : null}
                  </select>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{tRoles(member.role)}</p>
                    {isOwner ? (
                      <p className="text-xs text-muted-foreground">
                        {t("ownerLabel")}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <p className="font-mono text-xs text-muted-foreground">
                {formatDate(member.joinedAt, locale)}
              </p>

              <div className="flex justify-end">
                {canManage && !isSelf && !isOwner ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" disabled={busy === member.userId}>
                          {busy === member.userId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {currentUserRole === "owner" && member.role === "admin" ? (
                        <>
                          <DropdownMenuItem onClick={() => setTransferTarget(member)}>
                            <UserCog className="h-3.5 w-3.5" />
                            {tOwnership("menuItem")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() => void remove(member)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("remove")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <InviteDialog
        teamId={teamId}
        open={showInvite}
        onOpenChange={setShowInvite}
      />

      <Dialog
        open={transferTarget !== null}
        onOpenChange={(open) => !open && setTransferTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tOwnership("title")}</DialogTitle>
            <DialogDescription>
              {transferTarget
                ? tOwnership("confirm", {
                    userName: transferTarget.name || transferTarget.email,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-muted-foreground">
            {tOwnership("warning")}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTransferTarget(null)}
              disabled={busy !== null}
            >
              {tOwnership("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmTransfer}
              disabled={busy !== null}
            >
              {busy !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {busy !== null ? tOwnership("submitting") : tOwnership("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteDialog({
  teamId,
  open,
  onOpenChange,
}: {
  teamId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const t = useTranslations("team.invite");
  const tRoles = useTranslations("enums.role");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/teams/${teamId}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const code = typeof body?.details?.code === "string" ? body.details.code : "";
      const key =
        code === "ALREADY_MEMBER"
          ? "alreadyMember"
          : code === "ALREADY_INVITED"
            ? "alreadyInvited"
            : code === "INVALID_ROLE"
              ? "invalidRole"
              : "generic";
      toast.error(t(`errors.${key}`));
      return;
    }
    toast.success(t("success", { email }));
    setEmail("");
    setRole("member");
    onOpenChange(false);
    router.refresh();
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
            <Label htmlFor="invite-email">{t("email")}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              autoFocus
              placeholder={t("emailPlaceholder")}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">{t("role")}</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="admin">{tRoles("admin")}</option>
              <option value="member">{tRoles("member")}</option>
              <option value="viewer">{tRoles("viewer")}</option>
            </select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={busy || !email.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
