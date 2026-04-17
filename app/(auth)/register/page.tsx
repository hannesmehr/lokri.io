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
export default function RegisterPage() {
  return (
    <Card className="backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-display text-3xl leading-tight">
          Registrierung geschlossen
        </CardTitle>
        <CardDescription>
          Wir nehmen aktuell keine neuen Accounts auf. Wenn du bereits eingeladen
          bist oder einen bestehenden Zugang hast, melde dich einfach an.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Interessiert trotzdem? Schreib uns unter{" "}
          <a
            href="mailto:hello@lokri.io"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            hello@lokri.io
          </a>{" "}
          — wir melden uns, sobald die Registrierung wieder offen ist.
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button
          nativeButton={false}
          render={<Link href="/login" />}
          className="w-full"
        >
          Zum Login
        </Button>
      </CardFooter>
    </Card>
  );
}
