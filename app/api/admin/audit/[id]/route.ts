import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { auditEvents, ownerAccounts, users } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const [row] = await db
      .select({
        event: auditEvents,
        actorEmail: users.email,
        actorName: users.name,
        ownerAccountName: ownerAccounts.name,
        ownerAccountType: ownerAccounts.type,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .innerJoin(ownerAccounts, eq(ownerAccounts.id, auditEvents.ownerAccountId))
      .where(eq(auditEvents.id, id))
      .limit(1);
    if (!row) return notFound();

    return NextResponse.json({
      event: {
        ...row.event,
        createdAt: row.event.createdAt.toISOString(),
      },
      actor: row.actorEmail
        ? { email: row.actorEmail, name: row.actorName ?? null }
        : null,
      ownerAccount: {
        id: row.event.ownerAccountId,
        name: row.ownerAccountName,
        type: row.ownerAccountType,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.audit.detail]", err);
    return serverError(err);
  }
}
