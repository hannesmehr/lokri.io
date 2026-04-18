"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/i18n/formatters";
import type { Locale } from "@/lib/i18n/config";

/** Sentinel value used in the role-select dropdown to trigger the
 *  ownership-transfer flow instead of a plain role change. */
const TRANSFER_SENTINEL = "__transfer__";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
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
  const t = useTranslations("settings.team.members");
  const tTransfer = useTranslations(
    "settings.team.members.transferOwnership",
  );
  const tRoles = useTranslations("enums.role");
  const [busy, setBusy] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);

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
      const code = body?.details?.code;
      toast.error(
        code === "OWNER_PROTECTED" ? t("cannotDemoteOwner") : (body?.error ?? t("cannotDemoteOwner")),
      );
      return;
    }
    toast.success(t("roleChanged"));
    router.refresh();
  }

  /**
   * Wrapper around the native select's onChange. Intercepts the sentinel
   * so picking "→ Transfer ownership" opens the confirm dialog instead
   * of patching the role straight to itself (`admin → admin` is a no-op
   * anyway, and we want the warning).
   */
  function handleRoleSelect(m: Member, next: string) {
    if (next === TRANSFER_SENTINEL) {
      setTransferTarget(m);
      return;
    }
    void changeRole(m.userId, next);
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
      const code = body?.details?.code;
      const key =
        code === "OWNER_TRANSFER_NOT_ADMIN"
          ? "notAdmin"
          : code === "OWNER_TRANSFER_SELF"
            ? "selfTransfer"
            : code === "OWNER_TRANSFER_NOT_OWNER"
              ? "notOwner"
              : "generic";
      toast.error(tTransfer(`errors.${key}`));
      return;
    }
    const target = transferTarget;
    setTransferTarget(null);
    toast.success(
      tTransfer("success", { name: target.name || target.email }),
    );
    router.refresh();
  }

  async function remove(m: Member) {
    if (!confirm(t("removeConfirm", { name: m.name || m.email }))) return;
    setBusy(m.userId);
    const res = await fetch(`/api/teams/${teamId}/members/${m.userId}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const code = body?.details?.code;
      const msg =
        code === "OWNER_PROTECTED"
          ? t("cannotRemoveOwner")
          : body?.error ?? t("cannotRemoveSelf");
      toast.error(msg);
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{t("table.name")}</th>
              <th className="py-2 pr-3 font-medium">{t("table.email")}</th>
              <th className="py-2 pr-3 font-medium">{t("table.role")}</th>
              <th className="py-2 pr-3 font-medium">{t("table.joined")}</th>
              <th className="py-2 font-medium">{t("table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              const isOwner = m.role === "owner";
              // Owners are never edited via plain PATCH — transfer is
              // the only path in / out of the owner role, and it has
              // its own confirm dialog. The select is rendered only for
              // non-owners managed by an admin+.
              const canChangeThisRole = canManage && !isSelf && !isOwner;
              return (
                <tr key={m.userId}>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <span>{m.name}</span>
                      {isSelf ? (
                        <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t("selfBadge")}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{m.email}</td>
                  <td className="py-2 pr-3">
                    {canChangeThisRole ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleSelect(m, e.target.value)}
                        disabled={busy === m.userId}
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        {/* Owner option is only reachable via transfer — we
                            don't offer a plain "set → owner" path because
                            the intent should go through the confirm dialog. */}
                        <option value="admin">{tRoles("admin")}</option>
                        <option value="member">{tRoles("member")}</option>
                        <option value="viewer">{tRoles("viewer")}</option>
                        {currentUserRole === "owner" && m.role === "admin" ? (
                          <option value={TRANSFER_SENTINEL}>
                            {tTransfer("menuItem")}
                          </option>
                        ) : null}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs">
                        {tRoles(m.role)}
                        {isOwner ? (
                          <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-300">
                            {t("ownerBadge")}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {formatDate(m.joinedAt, locale)}
                  </td>
                  <td className="py-2">
                    {canManage && !isSelf && !isOwner ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === m.userId}
                        onClick={() => void remove(m)}
                      >
                        {busy === m.userId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        {t("remove")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <InviteDialog
        teamId={teamId}
        open={showInvite}
        onOpenChange={setShowInvite}
      />

      <Dialog
        open={transferTarget !== null}
        onOpenChange={(v) => !v && setTransferTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tTransfer("dialogTitle")}</DialogTitle>
            <DialogDescription>
              {transferTarget
                ? tTransfer("dialogBody", {
                    name: transferTarget.name || transferTarget.email,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTransferTarget(null)}
              disabled={busy !== null}
            >
              {tTransfer("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmTransfer}
              disabled={busy !== null}
            >
              {busy !== null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {busy !== null ? tTransfer("submitting") : tTransfer("submit")}
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
  const t = useTranslations("settings.team.invite");
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
      const code = body?.details?.code;
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
              className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="admin">{tRoles("admin")}</option>
              <option value="member">{tRoles("member")}</option>
              <option value="viewer">{tRoles("viewer")}</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !email.includes("@")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
