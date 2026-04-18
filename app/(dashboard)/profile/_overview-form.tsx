"use client";

import { Loader2, Mail, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

interface Props {
  initialName: string;
  initialImage: string | null;
  email: string;
  emailVerified: boolean;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export function ProfileOverviewForm({
  initialName,
  initialImage,
  email,
  emailVerified,
}: Props) {
  const router = useRouter();
  const t = useTranslations("profile.overview");
  const tToasts = useTranslations("toasts");
  const imageInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [image, setImage] = useState<string | null>(initialImage);
  const [savingProfile, setSavingProfile] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  const profileDirty =
    name.trim() !== initialName.trim() || image !== initialImage;
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || email[0]?.toUpperCase() || "?";

  async function onImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t("avatar.errors.tooLarge", { max: "2 MB" }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error(t("avatar.errors.invalidType"));
      return;
    }
    try {
      const url = await fileToDataURL(file);
      setImage(url);
    } catch {
      toast.error(t("avatar.errors.readFailed"));
    }
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profileDirty) return;
    setSavingProfile(true);
    const { error } = await authClient.updateUser({
      name: name.trim(),
      image: image ?? "",
    });
    setSavingProfile(false);
    if (error) {
      toast.error(error.message ?? t("errors.updateFailed"));
      return;
    }
    toast.success(tToasts("success.updated"));
    router.refresh();
  }

  async function requestEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    const target = newEmail.trim().toLowerCase();
    if (!target || !target.includes("@")) {
      setEmailError(t("email.errors.invalid"));
      return;
    }
    if (target === email.toLowerCase()) {
      setEmailError(t("email.errors.sameAsCurrent"));
      return;
    }
    setSavingEmail(true);
    const { error } = await authClient.changeEmail({
      newEmail: target,
      callbackURL: "/profile",
    });
    setSavingEmail(false);
    if (error) {
      setEmailError(error.message ?? t("email.errors.requestFailed"));
      return;
    }
    toast.success(t("email.success", { email: target }));
    setNewEmail("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <UserRound className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("profileCard.title")}</CardTitle>
              <CardDescription>{t("profileCard.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="h-20 w-20 rounded-full border object-cover"
                  />
                ) : (
                  <div className="grid h-20 w-20 place-items-center rounded-full bg-foreground text-xl font-semibold text-background">
                    {initials}
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-3">
                <input
                  ref={imageInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onImagePick}
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => imageInput.current?.click()}
                  >
                    {t("avatar.change")}
                  </Button>
                  {image ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setImage(null)}
                    >
                      {t("avatar.remove")}
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("avatar.help", { max: "2 MB" })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-name">{t("name.label")}</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name.placeholder")}
              />
              <p className="text-xs text-muted-foreground">{t("name.help")}</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!profileDirty || savingProfile}>
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {savingProfile ? t("profileCard.saving") : t("profileCard.save")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("email.title")}</CardTitle>
              <CardDescription>{t("email.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={requestEmailChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-email">{t("email.currentLabel")}</Label>
              <Input id="current-email" value={email} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                {emailVerified
                  ? t("email.currentVerified")
                  : t("email.currentUnverified")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-email">{t("email.newLabel")}</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder={t("email.placeholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("email.help", { currentEmail: email })}
              </p>
              {emailError ? (
                <p className="text-sm text-destructive" role="alert">
                  {emailError}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                disabled={savingEmail || !newEmail.trim()}
              >
                {savingEmail ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {savingEmail ? t("email.sending") : t("email.submit")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
