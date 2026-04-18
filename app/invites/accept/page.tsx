import { Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { AcceptInviteButton } from "./_accept-button";

/**
 * Landing page for magic-link invites. Three branches:
 *
 *   1. No token in URL → "invalid link" card.
 *   2. Not signed in  → buttons that redirect to /login or /register
 *      with `callbackURL=/invites/accept?token=…` so the user returns
 *      here post-auth. Registration is server-side closed (see
 *      `lib/auth.ts`) — the register button goes to the static page
 *      that explains it; invited users with no account must be added
 *      by the inviter first. Once registration opens up again, the
 *      flow works end-to-end.
 *   3. Signed in      → confirm card with an "Accept" button that POSTs
 *      to `/api/invites/accept`. Email-mismatch / expired tokens surface
 *      as toasts rendered in the client island.
 *
 * Note on email verification: because the recipient clicked the invite
 * link in their inbox, we treat the email as verified. For registered
 * users this is already true; for users who register specifically to
 * accept an invite, Better-Auth's `emailVerified` defaults to false but
 * the signup flow is currently closed anyway — when it reopens, we'll
 * have the flow set the flag directly.
 */
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("invites.accept");
  const tCommon = await getTranslations("common.buttons");

  const { token } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t("errors.invalidToken")}</CardTitle>
          </CardHeader>
          <CardFooter>
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              className="w-full"
            >
              {tCommon("signIn")}
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  if (!session) {
    const callbackUrl = `/invites/accept?token=${encodeURIComponent(token)}`;
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
        <Card className="w-full">
          <CardHeader>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
              <Mail className="h-5 w-5" />
            </div>
            <CardTitle className="text-center">
              {t("title", { teamName: "lokri.io" })}
            </CardTitle>
            <CardDescription className="text-center">
              {t("needsLogin")}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/login?callbackURL=${encodeURIComponent(callbackUrl)}`}
                />
              }
              className="w-full"
            >
              {t("loginButton")}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/register" />}
              className="w-full"
            >
              {t("registerButton")}
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  // Signed in — confirm card. Team name + role are revealed on accept
  // (the POST response carries them). Keeping the pre-accept view
  // generic avoids leaking membership info to a user whose email doesn't
  // match — `EMAIL_MISMATCH` surfaces after click and tells the user
  // to sign out.
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
            <Mail className="h-5 w-5" />
          </div>
          <CardTitle className="text-center">
            {t("title", { teamName: "lokri.io" })}
          </CardTitle>
          <CardDescription className="text-center">
            {session.user.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          {t("subtitle", { inviterName: "—", role: "" })}
        </CardContent>
        <CardFooter>
          <AcceptInviteButton token={token} />
        </CardFooter>
      </Card>
    </main>
  );
}
