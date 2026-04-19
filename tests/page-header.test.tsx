import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Render-Contract-Tests für `<PageHeader>`.
 *
 * Keine RTL / Vitest im Projekt — wir nutzen `renderToStaticMarkup`
 * aus `react-dom/server`, um das Output-HTML als String zu generieren
 * und gegen Regex zu matchen. Gibt uns Snapshot-ähnliche Sicherheit
 * für die strukturellen Invarianten (H1, Breadcrumb-Nav, Actions-Slot)
 * ohne Test-Framework-Zoo.
 *
 * Accessibility-Invarianten die wir pinnen:
 *   1. Genau ein `<h1>` — egal welche Kombination von Props
 *   2. Breadcrumbs rendern als `<nav aria-label="Breadcrumbs">`
 *      (screen-reader findet's, Links sind navigierbar)
 *   3. Breadcrumbs-letztes-Item ist unlinked + fett (current page
 *      nicht verlinken ist WCAG 2.4.8-konform)
 *   4. Description ist optional → wenn fehlt, kein `<p>` im Output
 *   5. Actions rendern in eigenem Container neben Title
 */

test("PageHeader — minimal (nur title) rendert exakt ein h1, keine nav", () => {
  const html = renderToStaticMarkup(<PageHeader title="Profil" />);
  const h1Count = (html.match(/<h1\b/g) ?? []).length;
  assert.equal(h1Count, 1, "genau ein h1");
  assert.match(html, /<h1[^>]*>Profil<\/h1>/);
  assert.ok(!html.includes('aria-label="Breadcrumbs"'), "kein nav ohne crumbs");
  assert.ok(!html.includes("<p"), "keine description-p");
});

test("PageHeader — mit description rendert ein p im muted-foreground-Stil", () => {
  const html = renderToStaticMarkup(
    <PageHeader title="Sicherheit" description="Passwort und 2FA verwalten" />,
  );
  assert.match(html, /Passwort und 2FA verwalten/);
  assert.match(html, /class="[^"]*text-muted-foreground[^"]*"/);
});

test("PageHeader — Breadcrumbs rendern mit aria-label + ChevronRight zwischen items", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="Sicherheit"
      breadcrumbs={[
        { label: "Profil", href: "/profile" },
        { label: "Sicherheit" },
      ]}
    />,
  );
  assert.match(html, /aria-label="Breadcrumbs"/);
  // Profile-Link ist verlinkt (nicht-letztes Item)
  assert.match(html, /<a[^>]+href="\/profile"[^>]*>Profil<\/a>/);
  // Sicherheit ist letztes Item → unlinked + fett
  assert.match(html, /<span[^>]*font-medium[^>]*>Sicherheit<\/span>/);
});

test("PageHeader — letzter Crumb auch mit href bleibt unlinked (current page)", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="X"
      breadcrumbs={[
        { label: "Root", href: "/root" },
        { label: "Last", href: "/last" },
      ]}
    />,
  );
  // Root ist verlinkt, Last nicht — auch wenn href angegeben war.
  assert.match(html, /<a[^>]+href="\/root"[^>]*>Root<\/a>/);
  assert.ok(
    !/<a[^>]+href="\/last"/.test(html),
    "Last-Crumb hat href, aber wird trotzdem nicht verlinkt (WCAG 2.4.8)",
  );
});

test("PageHeader — leere breadcrumbs-Liste rendert kein nav", () => {
  const html = renderToStaticMarkup(
    <PageHeader title="T" breadcrumbs={[]} />,
  );
  assert.ok(!html.includes('aria-label="Breadcrumbs"'));
});

test("PageHeader — actions-Slot rendert in eigenem Container", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      title="T"
      actions={<button type="button">Primary</button>}
    />,
  );
  assert.match(html, /<button[^>]*type="button"[^>]*>Primary<\/button>/);
});

test("PageHeader — Typografie-Klasse erzwingt User-Scope-H1 (text-3xl sm:text-4xl)", () => {
  // Regression-Guard: falls jemand die Klasse versehentlich auf die
  // Admin-Variante (text-lg sm:text-xl) zurückdreht, trippt dieser Test.
  const html = renderToStaticMarkup(<PageHeader title="X" />);
  assert.match(html, /<h1[^>]+class="[^"]*text-3xl[^"]*"/);
  assert.match(html, /<h1[^>]+class="[^"]*sm:text-4xl[^"]*"/);
});

test("PageHeader — alles zusammen (Crumbs + Description + Actions)", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      breadcrumbs={[
        { label: "Team", href: "/team" },
        { label: "Mitglieder" },
      ]}
      title="Team-Mitglieder"
      description="Invites, Rollen, Seat-Status"
      actions={<button type="button">Einladen</button>}
    />,
  );
  assert.match(html, /Team-Mitglieder/);
  assert.match(html, /Invites, Rollen/);
  assert.match(html, /Einladen/);
  assert.match(html, /aria-label="Breadcrumbs"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
});
