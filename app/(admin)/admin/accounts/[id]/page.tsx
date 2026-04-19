import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../../_breadcrumbs";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts, plans } from "@/lib/db/schema";
import { resolveAppOrigin } from "@/lib/origin";
import { AccountDetailClient } from "./_client";

type Params = { params: Promise<{ id: string }> };

/**
 * Server-Component fürs Account-Detail. Lädt Basisdaten + Plan-Liste für
 * den Plan-Wechsel-Selector. Alles andere (Members, Tokens, Rechnungen,
 * Quota, Verlauf) holt der Client-Island via SWR.
 */
export default async function AdminAccountDetailPage({ params }: Params) {
  await requireAdminSession();
  const { id } = await params;

  const [account] = await db
    .select({
      id: ownerAccounts.id,
      name: ownerAccounts.name,
    })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, id))
    .limit(1);
  if (!account) notFound();

  const planRows = await db
    .select({
      id: plans.id,
      name: plans.name,
      isSeatBased: plans.isSeatBased,
      isPurchasable: plans.isPurchasable,
    })
    .from(plans)
    .orderBy(plans.sortOrder);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Accounts", href: "/admin/accounts" },
          { label: account.name },
        ]}
      />
      <AccountDetailClient
        accountId={account.id}
        plans={planRows}
        publicAppUrl={process.env.NEXT_PUBLIC_APP_URL ?? resolveAppOrigin()}
        entraClientId={process.env.ENTRA_CLIENT_ID ?? null}
      />
    </div>
  );
}
