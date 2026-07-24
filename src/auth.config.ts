import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe subset of the NextAuth config: providers and pages only, no
 * Prisma-backed callbacks. Middleware runs on the Edge runtime, which can't
 * load Prisma's Node.js-only client — the DB-touching callbacks live in
 * `auth.ts` instead, used everywhere else (Server Components, Actions,
 * Route Handlers) where the Node.js runtime is available.
 */
export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
