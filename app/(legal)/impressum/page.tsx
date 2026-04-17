import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum · lokri.io",
};

export default function ImpressumPage() {
  return (
    <>
      <h1>Impressum</h1>

      <h2>Angaben gemäß § 5 TMG</h2>
      <p>
        Hannes Mehr
        <br />
        Claudiusstraße 107
        <br />
        22043 Hamburg
        <br />
        Deutschland
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail:{" "}
        <a href="mailto:hello@lokri.io">hello@lokri.io</a>
      </p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>
        Hannes Mehr
        <br />
        Claudiusstraße 107
        <br />
        22043 Hamburg
      </p>

      <h2>Haftungsausschluss</h2>

      <h3>Haftung für Inhalte</h3>
      <p>
        Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für
        die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir
        jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir gemäß § 7
        Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als
        Diensteanbieter jedoch nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen.
      </p>

      <h3>Haftung für Links</h3>
      <p>
        Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren
        Inhalte wir keinen Einfluss haben. Für die Inhalte der verlinkten
        Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich.
        Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch
        ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar.
      </p>

      <h3>Nutzerinhalte</h3>
      <p>
        Nutzerinnen und Nutzer speichern über lokri.io eigene Notizen, Dateien
        und API-Tokens. Für die Rechtmäßigkeit und Richtigkeit dieser Inhalte
        sind die jeweiligen Nutzer selbst verantwortlich. lokri.io verarbeitet
        diese Daten ausschließlich zur Bereitstellung der vertraglichen
        Funktionen (Synchronisation, semantische Suche, MCP-Zugriff).
      </p>
    </>
  );
}
