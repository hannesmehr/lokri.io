"use client";

import { createAuthClient } from "better-auth/react";

// baseURL defaults to window.location.origin in the browser, which is what we
// want for same-origin Next.js app routes (/api/auth/*).
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession, sendVerificationEmail } =
  authClient;
