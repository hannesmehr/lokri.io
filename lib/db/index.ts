import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * Neon Serverless Driver — WebSocket-basierter Pool.
 *
 * Wir nutzten früher `neon-http` + `neon(url)` (reiner HTTP-Client).
 * Der unterstützt `db.transaction()` **unconditionally nicht** —
 * `NeonHttpSession.transaction()` wirft in Drizzle 0.45 hart
 * (`node_modules/drizzle-orm/neon-http/session.js:152`). Das machte
 * `lib/teams/create.ts`, unser Admin-Account-Create, Notes-Update
 * und alle anderen Transaktions-Pfade latent kaputt — aufgedeckt
 * beim Team-Create-Flow aus der UI.
 *
 * Der Serverless-Driver (WebSocket-Pool) unterstützt echte
 * Postgres-Transaktionen (BEGIN/COMMIT) und liefert API-kompatibel
 * denselben Drizzle-Client. Reads + Writes ohne Transaktion sind
 * weiterhin ein HTTP-Fast-Path (`poolQueryViaFetch` ist per Default
 * bei unseren Query-Patterns aktiv), also keine messbare Latenz-
 * Regression.
 *
 * WebSocket-Konstruktor: Next.js 16 läuft auf Node 22, das eine
 * globale `WebSocket`-Klasse bereitstellt. Wir setzen sie explizit
 * an `neonConfig`, weil der Neon-Driver sonst keinen Default hat.
 * Keine `ws`-Package-Dependency nötig.
 */
if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export { schema };
