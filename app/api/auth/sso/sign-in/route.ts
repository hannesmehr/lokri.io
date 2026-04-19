import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { microsoftSsoProvider } from "@/lib/auth";
import { persistSsoState, type SsoStatePayload } from "@/lib/auth/sso";
import { db } from "@/lib/db";
import { teamSsoConfigs } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * SSO-Sign-In-Initiator — startet den OAuth-Flow.
 *
 * Flow:
 *   1. Team-Config für `ownerAccountId` laden
 *   2. State + Code-Verifier + Nonce generieren (PKCE-Material)
 *   3. Persist `sso-state:<state>` in `verifications` (TTL 10 min)
 *   4. Via Better-Auth-Provider-Objekt die authorization-URL bauen
 *   5. 302 Redirect zum IdP
 *
 * **Warum Option B statt Better-Auth's Standard-Sign-In-Social:**
 * Wir brauchen die `ownerAccountId` im Callback (Team-Kontext für
 * Tenant-Validation). Better-Auth's Standard-Flow hat dafür keinen
 * Slot. Deshalb besitzen wir State + Callback komplett und rufen
 * nur die nackten Provider-Methoden aus Better-Auth auf.
 *
 * Siehe `docs/sso-overview-plan.md` und Block 3 in
 * `docs/SSO_SETUP.md`.
 */

const querySchema = z.object({
  ownerAccountId: z.string().uuid(),
  /** Optionales Ziel nach erfolgreicher Anmeldung, kommt als Relative-
   *  Path durch — absolute URLs werden verworfen (Open-Redirect-Schutz). */
  redirectAfter: z
    .string()
    .regex(/^\/[^\s]*$/)
    .max(500)
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    if (!microsoftSsoProvider) {
      return redirectToLoginError(req, "sso.providerUnreachable");
    }

    const parsed = querySchema.safeParse({
      ownerAccountId: req.nextUrl.searchParams.get("ownerAccountId"),
      redirectAfter:
        req.nextUrl.searchParams.get("redirectAfter") ?? undefined,
    });
    if (!parsed.success) {
      return redirectToLoginError(req, "sso.configurationError");
    }
    const { ownerAccountId, redirectAfter } = parsed.data;

    const [config] = await db
      .select({
        tenantId: teamSsoConfigs.tenantId,
        enabled: teamSsoConfigs.enabled,
      })
      .from(teamSsoConfigs)
      .where(eq(teamSsoConfigs.ownerAccountId, ownerAccountId))
      .limit(1);

    if (!config || !config.enabled) {
      return redirectToLoginError(req, "sso.configurationError");
    }

    // PKCE-Material: State (CSRF-Token) + Code-Verifier + Nonce
    // (Replay-Protection im ID-Token). Alle drei sind random-strings;
    // `crypto.randomUUID()` liefert ~122 bit Entropie.
    const state = crypto.randomUUID().replace(/-/g, "");
    const codeVerifier = crypto.randomUUID().replace(/-/g, "");
    const nonce = crypto.randomUUID().replace(/-/g, "");

    const payload: SsoStatePayload = {
      codeVerifier,
      nonce,
      ownerAccountId,
      redirectAfter: redirectAfter ?? "/",
    };
    await persistSsoState(state, payload);

    const redirectURI = `${new URL(req.url).origin}/api/auth/sso/callback`;

    const authorizationUrl = await microsoftSsoProvider.createAuthorizationURL({
      state,
      codeVerifier,
      scopes: ["openid", "profile", "email"],
      redirectURI,
      // Entra erwartet `nonce` via zusätzlichen Query-Param — Better-
      // Auth's `createAuthorizationURL` setzt ihn nicht direkt, aber
      // für den ID-Token-Replay-Schutz brauchen wir ihn mit. Wir
      // hängen ihn unten an, bevor wir redirecten.
    });

    // Nonce + `prompt=select_account` draufkleben, damit User bei
    // Multi-Account-Logins (z.B. persönliches + Firmen-Microsoft im
    // selben Browser) die richtige Identität wählen kann.
    authorizationUrl.searchParams.set("nonce", nonce);
    if (!authorizationUrl.searchParams.has("prompt")) {
      authorizationUrl.searchParams.set("prompt", "select_account");
    }

    return NextResponse.redirect(authorizationUrl.toString(), { status: 302 });
  } catch (err) {
    console.error("[sso.sign-in]", err);
    return redirectToLoginError(req, "sso.providerUnreachable");
  }
}

function redirectToLoginError(req: NextRequest, code: string): NextResponse {
  const url = new URL("/login", req.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url.toString(), { status: 302 });
}
