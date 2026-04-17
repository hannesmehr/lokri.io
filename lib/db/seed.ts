import { db } from "./index";
import { plans } from "./schema";

/**
 * Plan catalog. Prices are in EUR cents; the `free` tier is idempotently
 * re-upserted so a fresh deploy can't end up without it (every new account
 * needs it as a starting point).
 */
const PLANS = [
  {
    id: "free",
    name: "Free",
    description: "Für den Einstieg. Kein Zahlungsmittel nötig.",
    maxBytes: 20 * 1024 * 1024, // 20 MB
    maxFiles: 100,
    maxNotes: 500,
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    sortOrder: 0,
    isPurchasable: false,
  },
  {
    id: "starter",
    name: "Starter",
    description: "100 MB Speicher — passt für regelmäßige Nutzung.",
    maxBytes: 100 * 1024 * 1024, // 100 MB
    maxFiles: 1_000,
    maxNotes: 5_000,
    priceMonthlyCents: 490, // 4.90 €/mo
    priceYearlyCents: 4900, // 49.00 €/yr (ca. 2 Monate Rabatt)
    sortOrder: 10,
    isPurchasable: true,
  },
  {
    id: "pro",
    name: "Pro",
    description: "1 GB — für Power-User mit großen Datei-Pools.",
    maxBytes: 1024 * 1024 * 1024, // 1 GB
    maxFiles: 10_000,
    maxNotes: 50_000,
    priceMonthlyCents: 1290, // 12.90 €/mo
    priceYearlyCents: 12900, // 129 €/yr
    sortOrder: 20,
    isPurchasable: true,
  },
  {
    id: "business",
    name: "Business",
    description: "10 GB — für Teams (Team-Features V2).",
    maxBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    maxFiles: 100_000,
    maxNotes: 500_000,
    priceMonthlyCents: 2900, // 29 €/mo
    priceYearlyCents: 29000, // 290 €/yr
    sortOrder: 30,
    isPurchasable: true,
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
