import { Resend } from "resend";

/**
 * Tiny wrapper around Resend so the call-sites don't hard-code the client
 * configuration. Graceful fallback: when `RESEND_API_KEY` is missing we log
 * to stdout instead of sending — preserves the previous "mailer stub"
 * behavior for local dev without a key.
 */

export interface MailArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional override of the From address, e.g. for system vs. tx. */
  from?: string;
}

function defaultFrom(): string {
  // Verified sending identity. For dev / first deploy we can use
  // `onboarding@resend.dev` which Resend hosts for every account. Switch to
  // `hi@lokri.io` once the domain's SPF/DKIM records are up.
  return process.env.MAIL_FROM ?? "lokri.io <onboarding@resend.dev>";
}

export async function sendMail(args: MailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = args.from ?? defaultFrom();

  if (!apiKey) {
    // Dev / unconfigured: mirror the old console-logger stub so nothing
    // silently fails and local signup flows stay usable.
    console.log(
      `\n=== [MAILER STUB — no RESEND_API_KEY] ===\n` +
        `From:    ${from}\n` +
        `To:      ${args.to}\n` +
        `Subject: ${args.subject}\n\n` +
        `${args.text}\n` +
        `==========================================\n`,
    );
    return;
  }

  const client = new Resend(apiKey);
  const { error } = await client.emails.send({
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (error) {
    console.error("[mailer] Resend error:", error);
    throw new Error(`Failed to send mail: ${error.message}`);
  }
}
