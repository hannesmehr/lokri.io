/**
 * Responsive Overflow-Audit.
 *
 * Standalone Node-Skript. Läuft gegen einen lokalen Dev-Server und
 * prüft eine Liste von Seiten auf drei Overflow-Arten pro Viewport:
 *
 *   1. Element-interner Overflow  — `scrollWidth > clientWidth`
 *      (Text ohne Wrap, zu breite Tabelle, inline-Content > Container)
 *   2. Right-Edge-Clipping        — `rect.right > window.innerWidth`
 *   3. Left-Edge-Clipping         — `rect.left < 0`
 *
 * Plus ein Top-Nav-Spezial-Check, der Nav-Kinder einzeln listet,
 * die über den Viewport hinausragen.
 *
 * Viewport-Liste bewusst ZWISCHEN den Breakpoint-Schwellen (siehe
 * `docs/DESIGN_SYSTEM.md` → Testing-Protokoll). Der bisherige Bug in
 * der Phase-1-QA war, dass alle Tests exakt auf 375/768/1280 liefen
 * — Zwischen-Breiten wurden nicht erfasst, wo die Bugs real leben.
 *
 * Aufruf:
 *
 *   pnpm tsx --env-file=.env.local scripts/responsive-audit.ts
 *
 * Optionale Flags:
 *
 *   --url /dashboard             Pfad relativ zur Basis-URL (kann mehrfach)
 *   --base http://localhost:3000 Basis-URL (Default: localhost:3000)
 *   --auth                       Session-Cookie aus DB signieren und setzen
 *                                (für gateten Seiten wie /dashboard)
 *   --email hannes@infected.de   User-Email für den Auth-Cookie (Default)
 *   --viewports 375,768,...      Custom-Viewport-Liste (Default: s.u.)
 *
 * Exit-Code: 0 bei 0 Violations, 1 sonst.
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { serializeSignedCookie } from "better-call";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

// ── CLI ──────────────────────────────────────────────────────────────

interface Args {
  urls: string[];
  base: string;
  auth: boolean;
  email: string;
  viewports: number[];
}

function parseArgs(argv: string[]): Args {
  const urls: string[] = [];
  let base = "http://localhost:3000";
  let auth = false;
  let email = "hannes@infected.de";
  let viewports: number[] = DEFAULT_VIEWPORTS;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") urls.push(argv[++i]);
    else if (a === "--base") base = argv[++i];
    else if (a === "--auth") auth = true;
    else if (a === "--email") email = argv[++i];
    else if (a === "--viewports")
      viewports = argv[++i].split(",").map((x) => parseInt(x.trim(), 10));
  }
  if (urls.length === 0) urls.push("/dashboard");
  return { urls, base, auth: auth || urls.some((u) => !PUBLIC_PATHS.has(u)), email, viewports };
}

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/forgot-password"]);

/**
 * Viewport-Breiten bewusst ZWISCHEN den Tailwind-Breakpoints (sm=640,
 * md=768, lg=1024, xl=1280). Ergänzt um Phone-Real-Widths (375/390/414).
 */
const DEFAULT_VIEWPORTS = [
  320, // iPhone SE
  375, // iPhone Mini
  390, // iPhone 12/13/14
  414, // iPhone Plus
  500, // Mobile → Tablet Übergang
  620, // knapp unter sm:
  700, // zwischen sm: und md:
  900, // zwischen md: und lg:
  1100, // zwischen lg: und xl:
  1280, // Desktop Standard
];

// ── In-Page Audit ────────────────────────────────────────────────────

interface Violation {
  selector: string;
  text: string;
  kind: "overflow" | "right-clip" | "left-clip" | "nav-child";
  detail: string;
}

/**
 * Audit-Logik als **String**, nicht als Function-Literal. Grund: tsx
 * wrappt named Functions mit esbuild's `__name`-Helper; Playwright
 * serialisiert Funktionen via toString(), und die Referenz auf
 * `__name` bricht im Browser-Context. String-Variante umgeht das.
 */
const AUDIT_SCRIPT = String.raw`
(() => {
  const vw = window.innerWidth;
  const violations = [];

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? ('#' + el.id) : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.')
      : '';
    const role = el.getAttribute('role');
    const aria = el.getAttribute('aria-label');
    const dataSlot = el.getAttribute('data-slot');
    const parts = [tag + id + cls];
    if (role) parts.push('[role="' + role + '"]');
    if (aria) parts.push('[aria-label="' + aria.slice(0, 30) + '"]');
    if (dataSlot) parts.push('[data-slot="' + dataSlot + '"]');
    return parts.join('');
  };

  const textOf = (el) => {
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return t.slice(0, 48);
  };

  const isSkippable = (el) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    // clientWidth < 10 = Element ist praktisch unsichtbar (z.B. sr-only
    // mit position:absolute + clip — BoundingRect meldet die Größe
    // trotzdem).
    if (el.clientWidth < 10 && el.scrollWidth < 10) return true;
    if (el.closest('nextjs-portal, [id^=__next-build]')) return true;
    if (el.hasAttribute('data-closed')) return true;
    // sr-only: Screen-Reader-only, optisch unsichtbar — kein UI-Overflow
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/\bsr-only\b/.test(cls)) return true;
    if (el.closest('.sr-only')) return true;
    return false;
  };

  // Intended-Overflow: truncate-Elemente schneiden bewusst ab. Der
  // scrollWidth meldet dann trotzdem den Full-Content; das ist
  // genau die Semantik der Klasse, kein Bug.
  const hasIntendedOverflow = (el) => {
    const cls = typeof el.className === 'string' ? el.className : '';
    if (/\btruncate\b/.test(cls)) return true;
    const style = window.getComputedStyle(el);
    if (style.overflow === 'hidden' && style.textOverflow === 'ellipsis') return true;
    // Explizites overflow-x-auto / scroll → bewusst scrollbar
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
    return false;
  };

  // Pass 1: Element-Level Overflow
  const candidates = document.querySelectorAll(
    'header, nav, main, section, article, aside, div, ul, ol, table'
  );
  for (const el of candidates) {
    if (isSkippable(el)) continue;
    if (hasIntendedOverflow(el)) continue; // truncate etc. — bewusst
    if (el.scrollWidth > el.clientWidth + 1) {
      violations.push({
        selector: describe(el),
        text: textOf(el),
        kind: 'overflow',
        detail: 'scrollWidth ' + el.scrollWidth + ' > clientWidth ' + el.clientWidth,
      });
    }
  }

  // Pass 2: Rect-Level right/left-clip
  const rectCandidates = document.querySelectorAll(
    'h1, h2, h3, h4, p, a, button, span, code, pre, img, svg, table, ul, ol'
  );
  for (const el of rectCandidates) {
    if (isSkippable(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1) {
      violations.push({
        selector: describe(el),
        text: textOf(el),
        kind: 'right-clip',
        detail: 'right ' + Math.round(r.right) + ' > vw ' + vw,
      });
    }
    if (r.left < -1) {
      violations.push({
        selector: describe(el),
        text: textOf(el),
        kind: 'left-clip',
        detail: 'left ' + Math.round(r.left) + ' < 0',
      });
    }
  }

  // Pass 3: Top-Nav-Spezial
  const nav = document.querySelector('header nav');
  if (nav) {
    for (const child of nav.querySelectorAll('a, button')) {
      if (isSkippable(child)) continue;
      const r = child.getBoundingClientRect();
      if (r.right > vw + 1) {
        violations.push({
          selector: 'header nav > ' + describe(child),
          text: textOf(child),
          kind: 'nav-child',
          detail: 'nav child right ' + Math.round(r.right) + ' > vw ' + vw,
        });
      }
    }
  }

  return violations;
})();
`;

// ── Auth Cookie ──────────────────────────────────────────────────────

async function signAuthCookie(
  email: string,
): Promise<{ name: string; value: string } | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!u) {
    console.error(`No user found with email ${email}`);
    return null;
  }
  const [s] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.userId, u.id), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.expiresAt))
    .limit(1);
  if (!s) {
    console.error(`No active session for user ${email}`);
    return null;
  }
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    console.error("BETTER_AUTH_SECRET not set in env");
    return null;
  }
  const cookieHeader = await serializeSignedCookie(
    "better-auth.session_token",
    s.token,
    secret,
    { path: "/", httpOnly: true, sameSite: "lax" },
  );
  // Header is "name=value; Path=/; ..." — extract just name=value
  const firstSemi = cookieHeader.indexOf(";");
  const nameValue = firstSemi >= 0 ? cookieHeader.slice(0, firstSemi) : cookieHeader;
  const eqIdx = nameValue.indexOf("=");
  return {
    name: nameValue.slice(0, eqIdx),
    value: nameValue.slice(eqIdx + 1),
  };
}

// ── Main ─────────────────────────────────────────────────────────────

function formatReport(
  results: Map<string, Map<number, Violation[]>>,
): { total: number; output: string } {
  let total = 0;
  const lines: string[] = [];
  for (const [url, viewports] of results) {
    lines.push(`\n── ${url} ────────────────────────────────────`);
    for (const [vw, violations] of viewports) {
      if (violations.length === 0) {
        lines.push(`  ${String(vw).padStart(4)} px  ✓ 0 violations`);
        continue;
      }
      total += violations.length;
      lines.push(`  ${String(vw).padStart(4)} px  ✗ ${violations.length}:`);
      // Dedupe by selector+kind — oft sind dieselben 10 Elemente
      // gleichzeitig right-clipped.
      const seen = new Set<string>();
      for (const v of violations) {
        const key = v.selector + "|" + v.kind;
        if (seen.has(key)) continue;
        seen.add(key);
        const snippet = v.text ? ` "${v.text}"` : "";
        lines.push(
          `         · [${v.kind}] ${v.selector.slice(0, 60)}${snippet}`,
        );
        lines.push(`           ${v.detail}`);
      }
      const remaining = violations.length - seen.size;
      if (remaining > 0) lines.push(`         (+${remaining} Duplikate)`);
    }
  }
  return { total, output: lines.join("\n") };
}

async function auditPage(
  ctx: BrowserContext,
  baseUrl: string,
  path: string,
  viewports: number[],
): Promise<Map<number, Violation[]>> {
  const page = await ctx.newPage();
  const result = new Map<number, Violation[]>();
  for (const vw of viewports) {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.goto(baseUrl + path, { waitUntil: "networkidle" });
    // Kleine Pause, damit CSS/Font-Loading wirklich fertig ist
    await page.waitForTimeout(200);
    const violations = (await page.evaluate(AUDIT_SCRIPT)) as Violation[];
    result.set(vw, violations);
  }
  await page.close();
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Responsive-Audit`);
  console.log(`  base     : ${args.base}`);
  console.log(`  urls     : ${args.urls.join(", ")}`);
  console.log(`  viewports: ${args.viewports.join(", ")}`);
  console.log(`  auth     : ${args.auth ? args.email : "public only"}`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  if (args.auth) {
    const cookie = await signAuthCookie(args.email);
    if (!cookie) {
      await browser.close();
      console.error("Cannot proceed without auth cookie for gated pages.");
      process.exit(2);
    }
    const u = new URL(args.base);
    await context.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        domain: u.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    console.log(`  cookie   : ${cookie.name}=${cookie.value.slice(0, 12)}…`);
  }

  const results = new Map<string, Map<number, Violation[]>>();
  for (const url of args.urls) {
    const r = await auditPage(context, args.base, url, args.viewports);
    results.set(url, r);
  }

  await browser.close();

  const { total, output } = formatReport(results);
  console.log(output);
  console.log(
    `\n${total === 0 ? "✓" : "✗"} ${total} violation${total === 1 ? "" : "s"} across ${args.urls.length} URL(s) × ${args.viewports.length} viewport(s).`,
  );
  process.exit(total === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(3);
});
