import { db } from "./index";
import { plans } from "./schema";

const FREE_PLAN = {
  id: "free",
  name: "Free",
  maxBytes: 20 * 1024 * 1024, // 20 MB
  maxFiles: 100,
  maxNotes: 500,
  priceEurMonthly: 0,
} as const;

async function main() {
  await db.insert(plans).values(FREE_PLAN).onConflictDoNothing();
  console.log(`Seeded plan: ${FREE_PLAN.id} (${FREE_PLAN.name})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
