export type BillingPeriod = "monthly" | "yearly";

export function computeBillingWindow(
  currentExpiry: Date | null | undefined,
  now: Date,
  period: BillingPeriod,
): { startsAt: Date; expiresAt: Date } {
  const startsAt = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const periodMs =
    period === "yearly"
      ? 365 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  return {
    startsAt,
    expiresAt: new Date(startsAt.getTime() + periodMs),
  };
}
