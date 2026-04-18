import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccountMembers, sessions, users } from "@/lib/db/schema";

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

    const lastLogin = sql<Date | null>`
      (SELECT max(${sessions.createdAt}) FROM ${sessions}
        WHERE ${sessions.userId} = ${users.id})`;
    const accountCount = sql<number>`
      (SELECT count(*)::int FROM ${ownerAccountMembers}
        WHERE ${ownerAccountMembers.userId} = ${users.id})`;

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
