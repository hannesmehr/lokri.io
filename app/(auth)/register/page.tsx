import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Self-service registration is currently closed. We keep the route alive
 * so old links don't 404 — they land on this "come back later" card. The
 * actual Better-Auth route is refused server-side via
 * `emailAndPassword.disableSignUp` (see `lib/auth.ts`); this page is the
 * friendly UX counterpart to that 400.
 */
export default async function RegisterPage() {
  const t = await getTranslations("auth.register");
  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-display text-3xl leading-tight">
          {t("title")}
        </CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t.rich("contactIntro", {
            email: () => (
              <a
                href="mailto:hello@lokri.io"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                hello@lokri.io
              </a>
            ),
          })}
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button
          nativeButton={false}
          render={<Link href="/login" />}
          className="w-full"
        >
          {t("toLogin")}
        </Button>
      </CardFooter>
    </Card>
  );
}
