import { hashPassword } from "better-auth/crypto";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnUser } from "@/lib/admin/audit";
import {
  createUserSchema,
  type CreateUserInput,
} from "@/lib/admin/create-user-schema";
import { db } from "@/lib/db";
import {
  accounts as authAccounts,
  ownerAccountMembers,
  ownerAccounts,
  sessions,
  users,
  verifications,
} from "@/lib/db/schema";
import { sendMail } from "@/lib/mailer";
import { accountSetupInvitationTemplate } from "@/lib/mailer/templates";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(["created", "login", "email"]).default("created"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  onlyAdmins: z
    .string()
    .transform((v) => v === "1" || v === "true")
    .optional(),
  onlyTeamCreators: z
    .string()
    .transform((v) => v === "1" || v === "true")
    .optional(),
  onlyUnverified: z
    .string()
    .transform((v) => v === "1" || v === "true")
    .optional(),
  onlyDisabled: z
    .string()
    .transform((v) => v === "1" || v === "true")
    .optional(),
});

/**
 * Admin-Liste aller User.
 *
 * `q` matcht per ILIKE auf `email` oder `name`. Pagination kapselt
 * immer 50 pro Seite (default). Sortierung nach Erstellt-Datum,
 * letztem Login (max(sessions.createdAt)) oder Email.
 *
 * Der "letzte Login" wird via LATERAL-Unterquery gezogen, damit der
 * Index auf `sessions (user_id, created_at DESC)` effektiv genutzt
 * wird und wir nicht pro User eine Full-Table-Query fahren.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();

    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const q = parsed.data;

    const conditions = [];
    if (q.q) {
      const pattern = `%${q.q}%`;
      conditions.push(or(ilike(users.email, pattern), ilike(users.name, pattern)));
    }
    if (q.onlyAdmins) conditions.push(eq(users.isAdmin, true));
    if (q.onlyTeamCreators) conditions.push(eq(users.canCreateTeams, true));
    if (q.onlyUnverified) conditions.push(eq(users.emailVerified, false));
    if (q.onlyDisabled) conditions.push(isNotNull(users.disabledAt));

    const where =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Korrelierte Subqueries — die äussere User-ID muss explizit
    // `"users"."id"` sein. Drizzle rendert `${users.id}` im
    // Subquery-Scope ohne Table-Prefix, weshalb Postgres im
    // Subquery-Scope nach einer lokalen `id`-Spalte sucht
    // (`owner_account_members.id` ist uuid, `user_id` ist text →
    // `operator does not exist: text = uuid`). Pre-existing-Bug,
    // hier mit hartkodiertem Alias fixed.
    const lastLogin = sql<Date | null>`
      (SELECT max("sessions"."created_at") FROM "sessions"
        WHERE "sessions"."user_id" = "users"."id")`;
    const accountCount = sql<number>`
      (SELECT count(*)::int FROM "owner_account_members"
        WHERE "owner_account_members"."user_id" = "users"."id")`;

    const orderCol =
      q.sort === "login"
        ? lastLogin
        : q.sort === "email"
          ? users.email
          : users.createdAt;
    const orderExpr = q.order === "asc" ? orderCol : desc(orderCol);

    const offset = (q.page - 1) * q.pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          emailVerified: users.emailVerified,
          isAdmin: users.isAdmin,
          canCreateTeams: users.canCreateTeams,
          disabledAt: users.disabledAt,
          preferredLocale: users.preferredLocale,
          createdAt: users.createdAt,
          lastLogin,
          accountCount,
        })
        .from(users)
        .where(where)
        .orderBy(orderExpr)
        .limit(q.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .where(where),
    ]);

    return NextResponse.json({
      users: rows.map((r) => ({
        ...r,
        // Force Date → ISO for safe JSON round-trip with SWR.
        createdAt: r.createdAt.toISOString(),
        lastLogin: r.lastLogin ? new Date(r.lastLogin).toISOString() : null,
        disabledAt: r.disabledAt ? r.disabledAt.toISOString() : null,
      })),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.list]", err);
    return serverError(err);
  }
}

// Only here to silence lint about unused isNull import if Drizzle
// shakes it. (We keep it imported for future filter additions.)
void isNull;

// ---------------------------------------------------------------------------
// POST — admin legt manuell einen User an
// ---------------------------------------------------------------------------

const FREE_PLAN_ID = "free";
const SETUP_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 Tage

// `CreateUserInput` ist nur für IDE-Completion importiert, nicht
// direkt referenziert — das Schema stammt aus `lib/admin/create-
// user-schema.ts` (DB-frei, testbar).
void (null as CreateUserInput | null);

/**
 * Erzeugt einen User manuell. Durchsticht Better-Auth's `disableSignUp`-
 * Gate (self-service ist geschlossen, admin-provisioning ist erlaubt).
 *
 * Ablauf:
 *   1. Duplikat-Check (409 bei bestehender Email)
 *   2. User-Row inkl. `emailVerified=true`, `canCreateTeams`,
 *      `preferredLocale` anlegen
 *   3. Personal-`owner_account` + Owner-Membership provisionieren
 *      (sonst kann der User sich nicht einloggen)
 *   4. Optional: Team-Membership in bestehenden Team-Account
 *   5. Setup-Methode:
 *      - `magic_link`: Verification-Row mit `reset-password:${token}`,
 *        7 Tage gültig; Setup-Mail via `accountSetupInvitationTemplate`
 *      - `initial_password`: Credential-Account mit gehashten Password;
 *        Plaintext einmalig in Response für den Admin zur Weitergabe
 *   6. Audit-Event `admin.user.created`
 *
 * Alle DB-Schritte laufen seriell (keine Transaktion, weil Neon-HTTP
 * keine unterstützt). Bei Fehler nach Schritt 2 bleibt ein halber User
 * stehen — ok, der Admin sieht die Email-Collision beim nächsten
 * Versuch (409) und kann den halben User löschen.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: actorId } = await requireAdminSession();

    const body = await parseJsonBody(req, 4096);
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    // Duplikat-Check.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing) {
      return apiError("Email existiert bereits.", 409, {
        code: "admin.user.emailExists",
      });
    }

    // Team-Check (falls angegeben: Account muss existieren + `type = team`).
    let teamAccount: { id: string; name: string } | null = null;
    if (input.team) {
      const [row] = await db
        .select({
          id: ownerAccounts.id,
          name: ownerAccounts.name,
          type: ownerAccounts.type,
        })
        .from(ownerAccounts)
        .where(eq(ownerAccounts.id, input.team.accountId))
        .limit(1);
      if (!row) {
        return apiError("Team-Account nicht gefunden.", 404, {
          code: "admin.user.teamNotFound",
        });
      }
      if (row.type !== "team") {
        return apiError("Account ist kein Team-Account.", 400, {
          code: "admin.user.teamNotTeam",
        });
      }
      teamAccount = { id: row.id, name: row.name };
    }

    const userId = crypto.randomUUID();
    const now = new Date();
    // `preferredLocale = "auto"` mappt auf `null` in der DB.
    const persistedLocale =
      input.preferredLocale === "auto" ? null : input.preferredLocale;
    // Name ist `NOT NULL` — fallback auf Local-Part der Email.
    const nameValue = input.name?.trim() || input.email.split("@")[0];

    // Step 2: User-Row.
    await db.insert(users).values({
      id: userId,
      email: input.email,
      name: nameValue,
      emailVerified: true,
      isAdmin: false,
      canCreateTeams: input.canCreateTeams,
      preferredLocale: persistedLocale,
      createdAt: now,
      updatedAt: now,
    });

    // Step 3: Personal owner_account + Owner-Membership (spiegelt den
    // `user.create.after`-Hook aus lib/auth.ts, den wir hier
    // umgehen — der Hook läuft nur bei Better-Auth-seitiger Erstellung).
    const [personalAccount] = await db
      .insert(ownerAccounts)
      .values({ type: "personal", name: nameValue, planId: FREE_PLAN_ID })
      .returning({ id: ownerAccounts.id });
    if (personalAccount) {
      await db.insert(ownerAccountMembers).values({
        ownerAccountId: personalAccount.id,
        userId,
        role: "owner",
      });
    }

    // Step 4: Optionales Team-Membership.
    if (input.team && teamAccount) {
      await db.insert(ownerAccountMembers).values({
        ownerAccountId: teamAccount.id,
        userId,
        role: input.team.role,
        invitedByUserId: actorId,
      });
    }

    // Step 5: Setup-Methode.
    let initialPassword: string | null = null;
    if (input.setupMethod.type === "initial_password") {
      const hashed = await hashPassword(input.setupMethod.password);
      await db.insert(authAccounts).values({
        id: crypto.randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: hashed,
        createdAt: now,
        updatedAt: now,
      });
      initialPassword = input.setupMethod.password;
    } else {
      // Magic-Link: Password-Reset-Token, aber mit 7-Tage-TTL statt
      // der üblichen 1 Stunde. Identifier-Prefix `reset-password:`
      // passt zu Better-Auth's `resetPassword`-Endpoint — der User
      // redeemt über `/reset-password?token=...` denselben Flow wie
      // ein regulärer "Passwort vergessen".
      const token = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(
        now.getTime() + SETUP_TOKEN_TTL_SECONDS * 1000,
      );
      await db.insert(verifications).values({
        id: crypto.randomUUID(),
        identifier: `reset-password:${token}`,
        value: userId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });

      const origin = new URL(req.url).origin;
      const setupUrl = `${origin}/reset-password?token=${token}`;
      const localeForEmail =
        persistedLocale === "en" ? "en" : "de";
      const tpl = await accountSetupInvitationTemplate({
        name: input.name ?? null,
        url: setupUrl,
        expiresAt,
        locale: localeForEmail,
      });
      try {
        await sendMail({ to: input.email, ...tpl });
      } catch (err) {
        console.error("[admin.users.create] sendMail failed:", err);
        // Mail-Fehler blockiert die Response nicht — der Admin sieht
        // den User als angelegt, kann über "Force Password Reset"
        // die Mail nachschicken.
      }
    }

    // Step 6: Audit.
    await logAdminActionOnUser({
      actorAdminUserId: actorId,
      targetUserId: userId,
      action: "admin.user.created",
      metadata: {
        email: input.email,
        setupMethod: input.setupMethod.type,
        canCreateTeams: input.canCreateTeams,
        addedToTeam: input.team
          ? { accountId: input.team.accountId, role: input.team.role }
          : null,
      },
    });

    return NextResponse.json(
      {
        userId,
        email: input.email,
        setupMethod: input.setupMethod.type,
        magicLinkSentTo:
          input.setupMethod.type === "magic_link" ? input.email : null,
        initialPassword,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.create]", err);
    return serverError(err);
  }
}
