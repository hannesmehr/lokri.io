"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// baseURL defaults to window.location.origin in the browser, which is what we
// want for same-origin Next.js app routes (/api/auth/*).
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // When the server returns `twoFactorRedirect: true` after a successful
      // password check, send the user to our 2FA page to complete sign-in.
      onTwoFactorRedirect: () => {
        if (typeof window !== "undefined") {
          window.location.href = "/two-factor";
        }
      },
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  sendVerificationEmail,
  twoFactor: twoFactorAuth,
} = authClient;
