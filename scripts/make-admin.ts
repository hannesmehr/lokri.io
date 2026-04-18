import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * One-shot: flip `users.is_admin = true` for the email passed as argv[2]
 * (defaults to the repo owner). Kept around so fresh environments have
 * a clean way to bootstrap the first admin without opening a psql
 * shell. Run via `pnpm exec tsx --env-file=.env.local
 * scripts/make-admin.ts [email]`.
 */
async function main() {
  const email = process.argv[2] ?? "hannes@infected.de";
  const rows = await db
    .update(users)
    .set({ isAdmin: true })
    .where(eq(users.email, email))
    .returning({ id: users.id, email: users.email, isAdmin: users.isAdmin });
  if (rows.length === 0) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
