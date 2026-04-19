import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { WidgetCard } from "@/components/ui/widget-card";

/**
 * Render-Contract-Tests für `<WidgetCard>`. Setzen die Pflicht-Pieces
 * (Label + Value) sowie die optionalen Slots (Hint, Action) strikt —
 * Settings-Redesign Block 1 wird mehrere Instanzen auf `/settings/
 * general` stellen, und wenn eins der Slots versehentlich wegrefaktort
 * wird, muss es hier trippen.
 */

test("WidgetCard — minimal (nur label + value)", () => {
  const html = renderToStaticMarkup(
    <WidgetCard label="Plan" value="Team" />,
  );
  assert.match(html, /Plan/);
  assert.match(html, /Team/);
  // Label-Style: uppercase + xs + muted
  assert.match(html, /uppercase/);
  // Value-Style: 2xl + semibold
  assert.match(html, /text-2xl/);
});

test("WidgetCard — mit Hint rendert p.text-muted-foreground", () => {
  const html = renderToStaticMarkup(
    <WidgetCard label="Plan" value="Team" hint="Abrechnungs-Tier" />,
  );
  assert.match(html, /Abrechnungs-Tier/);
  assert.match(html, /<p[^>]+class="[^"]*text-muted-foreground/);
});

test("WidgetCard — ohne Hint: kein <p>-Element für Hint", () => {
  const html = renderToStaticMarkup(
    <WidgetCard label="Plan" value="Team" />,
  );
  // Es gibt keine <p>-Elemente im Widget (Label ist div, Value ist div,
  // Action wäre div). Wenn Hint fehlt, darf auch keins reinkommen.
  assert.ok(
    !/<p\b/.test(html),
    "ohne Hint soll WidgetCard gar kein <p>-Element enthalten",
  );
});

test("WidgetCard — mit Action rendert den Action-Container", () => {
  const html = renderToStaticMarkup(
    <WidgetCard
      label="Plan"
      value="Team"
      action={<a href="/settings/billing">Ansehen →</a>}
    />,
  );
  assert.match(html, /<a[^>]+href="\/settings\/billing"[^>]*>Ansehen/);
});

test("WidgetCard — ohne Action keine spurious leere Action-Row", () => {
  const html = renderToStaticMarkup(
    <WidgetCard label="Plan" value="Team" hint="Hint-Text" />,
  );
  // Action-Container hat die Klasse `justify-end` — ohne Action darf
  // er nicht existieren (sonst gibt's leeren Flex-Raum am Ende).
  assert.ok(
    !/justify-end/.test(html),
    "ohne Action darf kein flex-end-Container erzeugt werden",
  );
});

test("WidgetCard — alles zusammen", () => {
  const html = renderToStaticMarkup(
    <WidgetCard
      label="Speicher"
      value="5 GB"
      hint="Bis zu 5 GB verfügbar"
      action={<a href="/files">Details →</a>}
    />,
  );
  assert.match(html, /Speicher/);
  assert.match(html, /5 GB/);
  assert.match(html, /Bis zu 5 GB verfügbar/);
  assert.match(html, /<a[^>]+href="\/files"/);
});

test("WidgetCard — className wird an Card-Root durchgereicht", () => {
  const html = renderToStaticMarkup(
    <WidgetCard label="X" value="Y" className="bg-accent" />,
  );
  assert.match(html, /class="[^"]*bg-accent[^"]*"/);
});

test("WidgetCard — Card-Root hat flex-Layout für gleichmäßige Höhe", () => {
  const html = renderToStaticMarkup(<WidgetCard label="X" value="Y" />);
  // `flex h-full flex-col` ermöglicht, dass Widget-Cards im Grid
  // gleich hoch laufen (`grid [&>*]:h-full`).
  assert.match(html, /class="[^"]*flex[^"]*h-full[^"]*flex-col/);
});
