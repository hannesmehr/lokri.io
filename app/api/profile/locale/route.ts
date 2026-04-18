import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  locales,
  localeCookieMaxAge,
  localeCookieName,
} from "@/lib/i18n/config";

export const runtime = "nodejs";

const bodySchema = z.object({
  locale: z.enum(locales),
});

/**
 * Update the signed-in user's UI language. Writes `users.preferred_locale`
 * and echoes the `lokri-locale` cookie so the next page render uses it
 * without a DB round-trip. Client calls this then `router.refresh()`.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const json = await parseJsonBody(req, 1024);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    await db
      .update(users)
      .set({ preferredLocale: parsed.data.locale })
      .where(eq(users.id, session.user.id));

    const res = NextResponse.json({ ok: true, locale: parsed.data.locale });
    res.cookies.set({
      name: localeCookieName,
      value: parsed.data.locale,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
      maxAge: localeCookieMaxAge,
    });
    return res;
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[api/profile/locale]", err);
    return serverError(err);
  }
}
