"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

interface Props {
  initialName: string;
  initialImage: string | null;
  email: string;
  emailVerified: boolean;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

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
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || email[0]?.toUpperCase() || "?";

  async function onImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Bild ist zu groß (max 2 MB).");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei auswählen.");
      return;
    }
    try {
      const url = await fileToDataURL(file);
      setImage(url);
    } catch {
      toast.error("Bild konnte nicht gelesen werden.");
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
      toast.error(error.message ?? "Konnte Profil nicht speichern.");
      return;
    }
    toast.success("Profil aktualisiert.");
    router.refresh();
  }

  async function requestEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEmailError(null);
    const target = newEmail.trim().toLowerCase();
    if (!target || !target.includes("@")) {
      setEmailError("Gültige Email eingeben.");
      return;
    }
    if (target === email.toLowerCase()) {
      setEmailError("Das ist deine aktuelle Email.");
      return;
    }
    setSavingEmail(true);
    const { error } = await authClient.changeEmail({
      newEmail: target,
      callbackURL: "/profile",
    });
    setSavingEmail(false);
    if (error) {
      setEmailError(error.message ?? "Konnte Email-Änderung nicht starten.");
      return;
    }
    toast.success(
      "Bestätigungs-Link geschickt — klick den Link in der Mail an deine neue Adresse.",
    );
    setNewEmail("");
  }

  return (
    <div className="space-y-8">
      {/* Profilbild + Name */}
      <form onSubmit={saveProfile} className="space-y-4">
        <div className="flex items-center gap-5">
          <div className="relative">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-16 w-16 rounded-full border object-cover"
              />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xl font-semibold text-white">
                {initials}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={imageInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onImagePick}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imageInput.current?.click()}
            >
              Bild ändern
            </Button>
            {image ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setImage(null)}
              >
                Entfernen
              </Button>
            ) : null}
            <p className="basis-full text-xs text-muted-foreground">
              PNG oder JPG, max 2 MB. Wird als Data-URL gespeichert — keine
              externen Anbieter.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-name">Name</Label>
          <Input
            id="profile-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!profileDirty || savingProfile}>
            {savingProfile ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {savingProfile ? "Speichere…" : "Profil speichern"}
          </Button>
        </div>
      </form>

      {/* Email-Änderung */}
      <form onSubmit={requestEmailChange} className="space-y-3 border-t pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Email-Adresse</h3>
            <p className="text-xs text-muted-foreground">
              Aktuell:{" "}
              <span className="font-medium text-foreground">{email}</span>
              {emailVerified ? " · verifiziert" : " · nicht verifiziert"}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-email">Neue Email-Adresse</Label>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="neue@adresse.tld"
          />
          <p className="text-xs text-muted-foreground">
            Wir schicken einen Bestätigungs-Link an die neue Adresse. Erst nach
            dem Klick wird umgestellt — deine aktuelle Email bleibt bis dahin
            aktiv.
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
            {savingEmail ? "Sende Bestätigung…" : "Bestätigungs-Link senden"}
          </Button>
        </div>
      </form>
    </div>
  );
}
