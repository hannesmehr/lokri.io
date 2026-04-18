import { db } from "./index";
import { plans } from "./schema";

/**
 * Plan catalog. Prices are in EUR cents; the `free` tier is idempotently
 * re-upserted so a fresh deploy can't end up without it (every new account
 * needs it as a starting point).
 *
 * **Display names + descriptions live in `messages/{locale}.json` under
 * `enums.planName.*` + `enums.planDescription.*`.** The DB columns carry
 * the plan id as a fallback/label — UI should prefer the translated
 * message key and treat the DB value as a technical identifier.
 *
 * The `team` plan uses `isSeatBased: true` — at runtime the quota helper
 * multiplies `max*` by the active seat count. `pricePerSeat*Cents` is
 * authoritative; the flat `priceMonthly/YearlyCents` fields are unused
 * for seat-based plans and left at 0.
 */
const PLANS = [
  {
    id: "free",
    name: "free",
    description: null as string | null,
    maxBytes: 20 * 1024 * 1024, // 20 MB
    maxFiles: 100,
    maxNotes: 500,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    isSeatBased: false,
    pricePerSeatMonthlyCents: null as number | null,
    pricePerSeatYearlyCents: null as number | null,
    sortOrder: 0,
    isPurchasable: false,
  },
  {
    id: "starter",
    name: "starter",
    description: null,
    maxBytes: 100 * 1024 * 1024, // 100 MB
    maxFiles: 1_000,
    maxNotes: 5_000,
    priceMonthlyCents: 490, // 4.90 €/mo
    priceYearlyCents: 4900, // 49.00 €/yr (ca. 2 Monate Rabatt)
    isSeatBased: false,
    pricePerSeatMonthlyCents: null,
    pricePerSeatYearlyCents: null,
    sortOrder: 10,
    isPurchasable: true,
  },
  {
    id: "pro",
    name: "pro",
    description: null,
    maxBytes: 1024 * 1024 * 1024, // 1 GB
    maxFiles: 10_000,
    maxNotes: 50_000,
    priceMonthlyCents: 1290, // 12.90 €/mo
    priceYearlyCents: 12900, // 129 €/yr
    isSeatBased: false,
    pricePerSeatMonthlyCents: null,
    pricePerSeatYearlyCents: null,
    sortOrder: 20,
    isPurchasable: true,
  },
  {
    id: "business",
    name: "business",
    description: null,
    maxBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    maxFiles: 100_000,
    maxNotes: 500_000,
    priceMonthlyCents: 2900, // 29 €/mo
    priceYearlyCents: 29000, // 290 €/yr
    isSeatBased: false,
    pricePerSeatMonthlyCents: null,
    pricePerSeatYearlyCents: null,
    sortOrder: 30,
    isPurchasable: true,
  },
  {
    id: "team",
    name: "team",
    description: null,
    // Base limits are per-seat; the quota helper multiplies by active
    // `owner_account_members` count.
    maxBytes: 5 * 1024 * 1024 * 1024, // 5 GB / seat
    maxFiles: 1_000,
    maxNotes: 5_000,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    isSeatBased: true,
    pricePerSeatMonthlyCents: 900, // 9 €/seat/month
    pricePerSeatYearlyCents: 9000, // 90 €/seat/year (≈ 2 months discount)
    sortOrder: 40,
    // Not purchasable via the normal upgrade flow — teams are manually
    // provisioned via `users.can_create_teams = true`.
    isPurchasable: false,
  },
] as const;

async function main() {
  for (const p of PLANS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: p.name,
          description: p.description,
          maxBytes: p.maxBytes,
          maxFiles: p.maxFiles,
          maxNotes: p.maxNotes,
          priceMonthlyCents: p.priceMonthlyCents,
          priceYearlyCents: p.priceYearlyCents,
          isSeatBased: p.isSeatBased,
          pricePerSeatMonthlyCents: p.pricePerSeatMonthlyCents,
          pricePerSeatYearlyCents: p.pricePerSeatYearlyCents,
          sortOrder: p.sortOrder,
          isPurchasable: p.isPurchasable,
        },
      });
    console.log(`Upserted plan: ${p.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
