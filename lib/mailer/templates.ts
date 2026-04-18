import { getTranslations } from "next-intl/server";
import { defaultLocale, type Locale } from "@/lib/i18n/config";

/**
 * Email templates — locale-aware. Every template takes a `locale` param
 * (`"de" | "en"`, default `"de"`), loads the matching `email.*` strings
 * via `getTranslations`, and returns `{ subject, html, text }`.
 *
 * Rendering stays intentionally dumb: plain string concatenation against
 * a minimal wrapper. Makes it trivial to swap to react-email later.
 */

const BRAND_GRADIENT = "linear-gradient(135deg, #6366f1, #d946ef)";

function wrap(body: string, locale: Locale, footer: string): string {
  return `<!doctype html>
<html lang="${locale}">
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
                ${footer}
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

async function loadEmailStrings(
  locale: Locale,
  section:
    | "verifyEmail"
    | "resetPassword"
    | "deleteAccount"
    | "changeEmail"
    | "twoFactorOtp"
    | "teamInvite",
) {
  const t = await getTranslations({ locale, namespace: `email.${section}` });
  const shared = await getTranslations({ locale, namespace: "email.shared" });
  return { t, shared };
}

function greeting(
  name: string | null,
  sharedT: Awaited<ReturnType<typeof getTranslations>>,
): string {
  return name ? sharedT("greeting", { name }) : sharedT("greetingFallback");
}

// ---------------------------------------------------------------------------

export async function verifyEmailTemplate({
  name,
  url,
  locale = defaultLocale,
}: {
  name: string | null;
  url: string;
  locale?: Locale;
}) {
  const { t, shared } = await loadEmailStrings(locale, "verifyEmail");
  const greet = greeting(name, shared);
  const footer = shared("footer");

  return {
    subject: t("subject"),
    text: `${greet}\n\n${t("intro")}\n\n${url}\n`,
    html: wrap(
      `<p>${greet}</p>
       <p>${t("intro")}</p>
       ${button(url, t("button"))}
       <p style="color:#555;font-size:13px">${t("fallback", { url: `<a href="${url}" style="color:#6366f1;word-break:break-all">${url}</a>` })}</p>`,
      locale,
      footer,
    ),
  };
}

export async function resetPasswordTemplate({
  name,
  url,
  locale = defaultLocale,
}: {
  name: string | null;
  url: string;
  locale?: Locale;
}) {
  const { t, shared } = await loadEmailStrings(locale, "resetPassword");
  const greet = greeting(name, shared);
  const footer = shared("footer");

  return {
    subject: t("subject"),
    text: `${greet}\n\n${t("intro")}\n\n${url}\n\n${t("ignoreHint")}`,
    html: wrap(
      `<p>${greet}</p>
       <p>${t("intro")}</p>
       ${button(url, t("button"))}
       <p style="color:#555;font-size:13px">${t("ignoreHint")}</p>`,
      locale,
      footer,
    ),
  };
}

export async function deleteAccountTemplate({
  name,
  url,
  locale = defaultLocale,
}: {
  name: string | null;
  url: string;
  locale?: Locale;
}) {
  const { t, shared } = await loadEmailStrings(locale, "deleteAccount");
  const greet = greeting(name, shared);
  const footer = shared("footer");

  return {
    subject: t("subject"),
    text: `${greet}\n\n${t("intro")}\n\n${url}\n\n${t("warning")}`,
    html: wrap(
      `<p>${greet}</p>
       <p>${t("intro")}</p>
       ${button(url, t("button"))}
       <p style="color:#d14343;font-size:13px;font-weight:500">⚠️ ${t("warning")}</p>`,
      locale,
      footer,
    ),
  };
}

export async function changeEmailTemplate({
  name,
  newEmail,
  url,
  locale = defaultLocale,
}: {
  name: string | null;
  newEmail: string;
  url: string;
  locale?: Locale;
}) {
  const { t, shared } = await loadEmailStrings(locale, "changeEmail");
  const greet = greeting(name, shared);
  const footer = shared("footer");

  return {
    subject: t("subject"),
    text: `${greet}\n\n${t("intro", { newEmail })}\n\n${url}\n`,
    html: wrap(
      `<p>${greet}</p>
       <p>${t("intro", { newEmail: `<strong>${newEmail}</strong>` })}</p>
       ${button(url, t("button"))}
       <p style="color:#555;font-size:13px">${t("warning")}</p>`,
      locale,
      footer,
    ),
  };
}

export async function twoFactorOtpTemplate({
  name,
  code,
  locale = defaultLocale,
}: {
  name: string | null;
  code: string;
  locale?: Locale;
}) {
  const { t, shared } = await loadEmailStrings(locale, "twoFactorOtp");
  const greet = greeting(name, shared);
  const footer = shared("footer");

  return {
    subject: t("subject"),
    text: `${greet}\n\n${t("intro")} ${code}\n\n${t("expiry", { minutes: 10 })}`,
    html: wrap(
      `<p>${greet}</p>
       <p>${t("intro")}</p>
       <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:4px;background:#f4f4f5;padding:14px 18px;border-radius:10px;display:inline-block">${code}</p>
       <p style="color:#555;font-size:13px">${t("expiry", { minutes: 10 })}</p>`,
      locale,
      footer,
    ),
  };
}

export async function teamInviteTemplate({
  teamName,
  inviterName,
  role,
  acceptUrl,
  expiresAt,
  locale = defaultLocale,
}: {
  teamName: string;
  inviterName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
  locale?: Locale;
}) {
  const { t, shared } = await loadEmailStrings(locale, "teamInvite");
  const footer = shared("footer");
  const expiryStr = new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(expiresAt);

  return {
    subject: t("subject", { teamName }),
    text: `${t("intro", { inviterName, teamName, role })}\n\n${acceptUrl}\n\n${t(
      "expiry",
      { expiresAt: expiryStr },
    )}\n\n${t("ignoreHint")}`,
    html: wrap(
      `<h2 style="font-size:18px;margin:0 0 12px">${t("heading")}</h2>
       <p>${t("intro", {
         inviterName: `<strong>${inviterName}</strong>`,
         teamName: `<strong>${teamName}</strong>`,
         role: `<strong>${role}</strong>`,
       })}</p>
       ${button(acceptUrl, t("button"))}
       <p style="color:#555;font-size:13px">${t("expiry", { expiresAt: expiryStr })}</p>
       <p style="color:#555;font-size:13px">${t("ignoreHint")}</p>`,
      locale,
      footer,
    ),
  };
}
