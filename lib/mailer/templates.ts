/**
 * Email templates. Plain HTML + text fallbacks — kept deliberately minimal
 * so we can swap to react-email or a proper design system without
 * restructuring the mailer call-sites.
 *
 * Every template returns `{ subject, html, text }`. Both branches share the
 * same copy — HTML adds a button + branding wrapper.
 */

const BRAND_GRADIENT = "linear-gradient(135deg, #6366f1, #d946ef)";

function wrap(body: string): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>lokri.io</title>
  </head>
  <body style="margin:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:32px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #eaeaea;overflow:hidden">
            <tr>
              <td style="padding:28px 28px 8px">
                <table role="presentation"><tr>
                  <td style="background:${BRAND_GRADIENT};color:#fff;font-weight:700;font-size:14px;width:28px;height:28px;text-align:center;border-radius:8px">l</td>
                  <td style="padding-left:10px;font-weight:600;font-size:15px">lokri.io</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;font-size:15px;line-height:1.55">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 24px;font-size:12px;color:#888;border-top:1px solid #f0f0f0">
                Diese Mail wurde automatisch von lokri.io verschickt. Wenn du das
                nicht warst, ignoriere diese Nachricht einfach.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(href: string, label: string): string {
  return `<div style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:500;font-size:14px">${label}</a></div>`;
}

// ---------------------------------------------------------------------------

export function verifyEmailTemplate({
  name,
  url,
}: {
  name: string | null;
  url: string;
}) {
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  return {
    subject: "Bestätige deine lokri.io Email",
    text: `${greeting}

klick den folgenden Link, um deine Email zu bestätigen:

${url}

Der Link ist 1 Stunde gültig.`,
    html: wrap(
      `<p>${greeting}</p>
       <p>klick den Button, um deine Email zu bestätigen und deinen Account zu aktivieren.</p>
       ${button(url, "Email bestätigen")}
       <p style="color:#555;font-size:13px">Falls der Button nicht funktioniert, kopiere diesen Link:<br>
       <a href="${url}" style="color:#6366f1;word-break:break-all">${url}</a></p>
       <p style="color:#555;font-size:13px">Der Link ist 1 Stunde gültig.</p>`,
    ),
  };
}

export function resetPasswordTemplate({
  name,
  url,
}: {
  name: string | null;
  url: string;
}) {
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  return {
    subject: "Setze dein lokri.io Passwort zurück",
    text: `${greeting}

du hast angefragt, dein Passwort zurückzusetzen. Klick den folgenden Link:

${url}

Der Link ist 1 Stunde gültig. Wenn du das nicht warst, ignoriere diese Mail.`,
    html: wrap(
      `<p>${greeting}</p>
       <p>du hast angefragt, dein Passwort zurückzusetzen. Klick den Button, um ein neues Passwort festzulegen.</p>
       ${button(url, "Passwort zurücksetzen")}
       <p style="color:#555;font-size:13px">Falls der Button nicht funktioniert, kopiere diesen Link:<br>
       <a href="${url}" style="color:#6366f1;word-break:break-all">${url}</a></p>
       <p style="color:#555;font-size:13px">Der Link ist 1 Stunde gültig. Wenn du diese Anfrage nicht gestellt hast, ignoriere diese Mail — dein Passwort bleibt unverändert.</p>`,
    ),
  };
}

export function deleteAccountTemplate({
  name,
  url,
}: {
  name: string | null;
  url: string;
}) {
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  return {
    subject: "lokri.io Account-Löschung bestätigen",
    text: `${greeting}

du hast angefragt, deinen lokri.io-Account zu löschen. Klick den folgenden Link, um die Löschung zu bestätigen. Diese Aktion kann nicht rückgängig gemacht werden.

${url}

Der Link ist 1 Stunde gültig. Wenn du das nicht warst, ignoriere diese Mail — dein Account bleibt bestehen.`,
    html: wrap(
      `<p>${greeting}</p>
       <p>du hast angefragt, deinen lokri.io-Account zu löschen. Zur Bestätigung klick bitte den Button:</p>
       ${button(url, "Account endgültig löschen")}
       <p style="color:#d14343;font-size:13px;font-weight:500">⚠️ Diese Aktion kann nicht rückgängig gemacht werden. Alle Spaces, Notes, Files und API-Tokens werden gelöscht.</p>
       <p style="color:#555;font-size:13px">Der Link ist 1 Stunde gültig. Wenn du diese Anfrage nicht gestellt hast, ignoriere diese Mail.</p>`,
    ),
  };
}

export function changeEmailTemplate({
  name,
  newEmail,
  url,
}: {
  name: string | null;
  newEmail: string;
  url: string;
}) {
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  return {
    subject: "Bestätige deine neue Email-Adresse",
    text: `${greeting}

du hast deine Email-Adresse auf ${newEmail} geändert. Klick zur Bestätigung:

${url}

Der Link ist 1 Stunde gültig. Wenn du das nicht warst, ignoriere diese Mail.`,
    html: wrap(
      `<p>${greeting}</p>
       <p>du hast deine Email-Adresse auf{" "}
       <strong>${newEmail}</strong> geändert. Klick den Button, um die
       neue Adresse zu bestätigen.</p>
       ${button(url, "Neue Email bestätigen")}
       <p style="color:#555;font-size:13px">Der Link ist 1 Stunde gültig.
       Wenn du das nicht warst, ignoriere diese Mail — deine alte Adresse
       bleibt aktiv.</p>`,
    ),
  };
}

export function twoFactorOtpTemplate({
  name,
  code,
}: {
  name: string | null;
  code: string;
}) {
  const greeting = name ? `Hallo ${name},` : "Hallo,";
  return {
    subject: `lokri.io 2FA-Code: ${code}`,
    text: `${greeting}

dein 2FA-Code: ${code}

Der Code ist 10 Minuten gültig.`,
    html: wrap(
      `<p>${greeting}</p>
       <p>dein 2FA-Code:</p>
       <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:4px;background:#f4f4f5;padding:14px 18px;border-radius:10px;display:inline-block">${code}</p>
       <p style="color:#555;font-size:13px">Der Code ist 10 Minuten gültig. Wenn du das nicht warst, ändere dringend dein Passwort.</p>`,
    ),
  };
}
