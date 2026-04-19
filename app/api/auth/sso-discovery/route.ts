import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverError, zodError } from "@/lib/api/errors";
import { findSsoTeamForEmail } from "@/lib/auth/sso";

export const runtime = "nodejs";

/**
 * SSO-Discovery.
 *
 * Die Login-Page ruft diese Route auf, sobald der User eine Email
 * tippt (debounced, client-seitig). Response entscheidet, ob das
 * Formular auf „Weiter mit Microsoft" umschaltet oder den normalen
 * Passwort-Flow zeigt.
 *
 * Design-Entscheidungen:
 *   - Öffentlich abrufbar (kein Session-Gate), damit die Login-Page
 *     das vor dem Login abfragen kann. Kein Informations-Leak, weil
 *     wir **immer** dieselbe Shape zurückgeben — entweder SSO-Info
 *     oder `{ ssoEnabled: false }`. Insbesondere bestätigen wir
 *     nicht, ob die Email existiert.
 *   - Kein Rate-Limit hier (kommt in Phase 2 wenn nötig) — die Route
 *     ist idempotent + billig (ein SELECT mit WHERE enabled=true).
 *   - Sign-In-URL wird direkt zurückgegeben, damit der Client nicht
 *     die Team-ID selbst behält. Schutz gegen Manipulation: der
 *     State, der intern generiert wird, ist an die Team-ID gebunden
 *     (siehe `/api/auth/sso/sign-in`).
 */

const querySchema = z.object({
  email: z.string().trim().email().max(200),
});

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      email: req.nextUrl.searchParams.get("email"),
    });
    if (!parsed.success) return zodError(parsed.error);

    const match = await findSsoTeamForEmail(parsed.data.email);
    if (!match) {
      return NextResponse.json({ ssoEnabled: false });
    }

    // Sign-In-URL zeigt auf unsere eigene Route, die dann das
    // eigentliche OAuth-Redirect zum IdP baut. State + PKCE-
    // Material wird serverseitig erzeugt (nicht hier!), damit die
    // Client-Seite keine Chance hat, Team-Context zu manipulieren.
    const signInUrl = `/api/auth/sso/sign-in?ownerAccountId=${encodeURIComponent(match.ownerAccountId)}`;

    return NextResponse.json({
      ssoEnabled: true,
      provider: match.provider,
      signInUrl,
    });
  } catch (err) {
    console.error("[sso.discovery]", err);
    return serverError(err);
  }
}
