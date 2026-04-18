import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  notFound,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { findOwnedSpace } from "@/lib/api/ownership";
import { findOwnedStorageProvider } from "@/lib/api/ownership";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    storageProviderId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.description !== undefined ||
      v.storageProviderId !== undefined,
    { message: "At least one field must be provided." },
  );

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const space = await findOwnedSpace(ownerAccountId, id);
    if (!space) return notFound();
    return NextResponse.json({ space });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const existing = await findOwnedSpace(ownerAccountId, id);
    if (!existing) return notFound();

    const json = await parseJsonBody(req, 64 * 1024);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    if (parsed.data.storageProviderId) {
      const provider = await findOwnedStorageProvider(
        ownerAccountId,
        parsed.data.storageProviderId,
      );
      if (!provider) return unauthorized("Storage provider not found.");
    }

    const [updated] = await db
      .update(spaces)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        ...(parsed.data.storageProviderId !== undefined
          ? { storageProviderId: parsed.data.storageProviderId }
          : {}),
      })
      .where(eq(spaces.id, id))
      .returning();

    return NextResponse.json({ space: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const existing = await findOwnedSpace(ownerAccountId, id);
    if (!existing) return notFound();

    // Cascades: space_members cascade-delete; notes.space_id / files.space_id
    // are nullable with ON DELETE SET NULL, so resources become "unsorted"
    // rather than disappearing.
    await db.delete(spaces).where(eq(spaces.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
