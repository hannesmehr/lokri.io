import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutz · lokri.io",
};

export default function DatenschutzPage() {
  return (
    <>
      <h1>Datenschutzerklärung</h1>

      <h2>1. Datenschutz auf einen Blick</h2>
      <p>
        lokri.io ist ein DSGVO-konformer MCP-Gateway für persönliche
        Wissensdaten. Diese Datenschutzerklärung informiert darüber, wie
        personenbezogene Daten bei der Nutzung von lokri.io verarbeitet werden.
        Unser Datenmodell ist strikt mandantengetrennt: Daten eines Accounts
        werden niemals mit Daten anderer Accounts vermischt, weder für
        Suchergebnisse noch für Embeddings oder Modell-Trainings.
      </p>

      <h2>2. Verantwortliche Stelle</h2>
      <p>
        Hannes Mehr
        <br />
        Claudiusstraße 107
        <br />
        22043 Hamburg
        <br />
        Deutschland
      </p>
      <p>
        E-Mail:{" "}
        <a href="mailto:hello@lokri.io">hello@lokri.io</a>
      </p>

      <h2>3. Erhebung und Speicherung personenbezogener Daten</h2>

      <h3>Beim Besuch der Website</h3>
      <p>
        Bei jedem Aufruf werden technisch notwendige Informationen an den
        Server übermittelt und in Log-Dateien temporär gespeichert. Erhoben
        werden:
      </p>
      <ul>
        <li>IP-Adresse (gekürzt zur Rate-Limit-Bestimmung)</li>
        <li>Datum und Uhrzeit des Zugriffs</li>
        <li>Aufgerufener Pfad</li>
        <li>Referrer-URL</li>
        <li>Verwendeter Browser und Betriebssystem (User-Agent)</li>
      </ul>
      <p>
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
        am sicheren Betrieb). Hosting und Zustellung erfolgen über Vercel
        (siehe Abschnitt 9).
      </p>

      <h3>Bei Registrierung und Nutzung</h3>
      <p>
        Bei der Registrierung speichern wir die von dir angegebene Email-Adresse,
        einen frei wählbaren Anzeigenamen sowie einen gehashten Passwort-Wert
        (bcrypt). Authentifizierungs-Sessions werden über serverseitige Cookies
        verwaltet (Better-Auth). Bei aktivierter Zwei-Faktor-Authentifizierung
        speichern wir zusätzlich den TOTP-Secret sowie Backup-Codes.
      </p>

      <h3>Bei Nutzung der App</h3>
      <p>
        Spaces, Notes, Files und API-Tokens werden inhaltlich gespeichert, um
        sie dir über die Web-UI und das MCP-Protokoll zur Verfügung zu stellen.
        Zur semantischen Suche werden Text-Embeddings berechnet und in unserer
        Datenbank als Vektor abgelegt. File-Inhalte (Dateien) speichern wir
        ausschließlich im privaten Modus — Zugriff nur über authentifizierte
        Requests.
      </p>

      <h3>OAuth 2.1 (MCP-Clients)</h3>
      <p>
        MCP-Clients (z.B. Claude Desktop, ChatGPT, Cursor) registrieren sich
        dynamisch per OAuth 2.1 (RFC 7591 / PKCE). Wir speichern pro Client:
        Client-Id, Redirect-URIs, erteiltes Consent sowie die ausgestellten
        Access- und Refresh-Tokens (zeitlich begrenzt). Du kannst Clients und
        Tokens jederzeit im Dashboard unter <em>Settings</em> widerrufen.
      </p>

      <h2>4. Cookies</h2>
      <p>
        lokri.io verwendet ausschließlich <strong>technisch notwendige
        Cookies</strong>:
      </p>
      <ul>
        <li>
          <strong>Session-Cookie (Better-Auth)</strong> — hält dich eingeloggt.
          HTTP-only, Same-Site-Lax, verschlüsselt.
        </li>
        <li>
          <strong>Rate-Limit-Identifier (optional)</strong> — nur wenn kein
          Anmelde-Cookie vorhanden ist. Enthält keine persönlichen Daten.
        </li>
      </ul>
      <p>
        Wir setzen keine Tracking- oder Werbe-Cookies. Eine explizite
        Einwilligung ist daher nicht erforderlich (Art. 6 Abs. 1 lit. f DSGVO
        i.V.m. § 25 Abs. 2 TTDSG).
      </p>

      <h2>5. Webanalyse</h2>
      <p>
        Wir nutzen Vercel Analytics und Vercel Speed Insights. Diese Dienste
        messen aggregierte Nutzungs- und Performance-Daten (z.B. Seiten-Ladezeit,
        Web-Vitals) ohne Cookies und ohne Profilbildung. Eine Übermittlung an
        Dritte erfolgt nicht.
      </p>

      <h2>6. KI-Integrationen</h2>
      <p>
        Zur semantischen Suche senden wir Note- und Datei-Inhalte an das{" "}
        <strong>Vercel AI Gateway</strong>, das intern das Modell{" "}
        <code>openai/text-embedding-3-small</code> aufruft. Die so erzeugten
        Vektoren werden in unserer Datenbank gespeichert. Die von uns
        übermittelten Texte werden laut Vercel/OpenAI nicht für das Training
        der Modelle verwendet.
      </p>
      <p>
        MCP-Clients wie Claude Desktop oder ChatGPT können auf deinen Account
        über einen Bearer-Token oder OAuth-Access-Token zugreifen. Die dabei
        übertragenen Inhalte verlassen lokri.io in Richtung dieser Clients;
        die Verarbeitung dort richtet sich nach dem jeweiligen Anbieter (z.B.
        Anthropic, OpenAI). Du kontrollierst über die Consent-Seite, welche
        Clients Zugriff haben.
      </p>

      <h2>7. Speicherdauer</h2>
      <p>
        Account-Daten bleiben gespeichert, solange dein Account existiert. Du
        kannst deinen Account jederzeit im Dashboard unter{" "}
        <em>Settings → Account löschen</em> entfernen — dabei werden alle
        Spaces, Notes, Files, Tokens und OAuth-Consents samt Blob-Storage-Inhalten
        unverzüglich gelöscht. Email-Verifizierungs- und Password-Reset-Tokens
        werden nach max. 1 Stunde automatisch invalidiert.
      </p>

      <h2>8. Deine Rechte</h2>
      <p>Du hast das Recht auf:</p>
      <ul>
        <li>Auskunft über deine gespeicherten Daten (Art. 15 DSGVO)</li>
        <li>Berichtigung (Art. 16 DSGVO)</li>
        <li>Löschung (Art. 17 DSGVO)</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
        <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
        <li>Widerspruch (Art. 21 DSGVO)</li>
      </ul>
      <p>
        Für Auskunft und alle weiteren Anfragen kontaktiere uns unter{" "}
        <a href="mailto:hello@lokri.io">hello@lokri.io</a>. Du hast außerdem
        das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.
      </p>

      <h2>9. Auftragsverarbeiter / Drittanbieter</h2>
      <p>Folgende Dienste verarbeiten in unserem Auftrag personenbezogene Daten:</p>
      <ul>
        <li>
          <strong>Vercel Inc.</strong> (USA) — Hosting, CDN, Analytics, Speed
          Insights, AI Gateway. EU-Server-Regionen werden bevorzugt; Transfers
          in die USA erfolgen auf Basis der EU-Standardvertragsklauseln.
        </li>
        <li>
          <strong>Neon (Databricks)</strong> (EU — Frankfurt) — Postgres-Datenbank.
        </li>
        <li>
          <strong>Vercel Blob</strong> — Datei-Storage. Private Access-Policy,
          Auslieferung ausschließlich nach Authentifizierung.
        </li>
        <li>
          <strong>Upstash</strong> — Redis für Rate-Limiting. Keine
          personenbezogenen Inhalte, nur anonymisierte Request-Identifier.
        </li>
        <li>
          <strong>Resend</strong> — Versand transaktionaler Emails
          (Verifizierung, Password-Reset, Account-Löschung, 2FA).
        </li>
        <li>
          <strong>OpenAI via Vercel AI Gateway</strong> — Embedding-Erzeugung.
          Text-Eingaben werden nicht zum Training verwendet.
        </li>
      </ul>

      <h2>10. Änderungen</h2>
      <p>
        Wir können diese Datenschutzerklärung anpassen, um Gesetzesänderungen
        oder Änderungen unseres Dienstes abzubilden. Wesentliche Änderungen
        teilen wir dir per Email mit, sofern du einen Account hast.
      </p>

      <p className="mt-10 text-xs text-muted-foreground">
        Stand: April 2026
      </p>
    </>
  );
}
