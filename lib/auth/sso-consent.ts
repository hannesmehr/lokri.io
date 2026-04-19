import { resolveAppOrigin } from "@/lib/origin";

export function getEntraAdminConsentUrl(
  tenantId: string,
  options?: { clientId?: string; appOrigin?: string },
): string {
  const clientId = options?.clientId ?? process.env.ENTRA_CLIENT_ID;
  if (!clientId) {
    throw new Error("ENTRA_CLIENT_ID is not configured");
  }
  const appOrigin = options?.appOrigin ?? resolveAppOrigin();
  const redirectUri = `${appOrigin}/team/security?consent=returned`;
  const url = new URL(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/adminconsent`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}
