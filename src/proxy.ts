import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

// Edge-safe instance (providers/pages only, no Prisma) — just a fast
// first-pass check that a session cookie exists at all. The authoritative,
// DB-backed check (does the agent still exist and is it active?) happens in
// the `(app)` layout via the full `auth()` from `@/auth`, which runs on the
// Node.js runtime on every protected navigation anyway.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/tickets/:path*", "/clients/:path*", "/settings/:path*"],
};
