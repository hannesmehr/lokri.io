import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { getCachedStats } from "@/lib/admin/stats-cache";
import { db } from "@/lib/db";
import { auditEvents } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Liste aller distinct `action`-Werte aus `audit_events` — für das
 * Dropdown im Audit-Viewer. 5-Minuten-Cache, da die Action-Menge
 * quasi-statisch ist (neue Actions kommen nur beim Feature-Release).
 */
export async function GET() {
  try {
    await requireAdminSession();
    const actions = await getCachedStats("audit.actions", 300, async () => {
      const rows = await db
        .selectDistinct({ action: auditEvents.action })
        .from(auditEvents)
        .orderBy(auditEvents.action);
      return rows.map((r) => r.action);
    });
    return NextResponse.json({ actions });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.audit.actions]", err);
    return serverError(err);
  }
}

// Silence unused import warnings for lint; keeps future filters easy.
void sql;
