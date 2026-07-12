import NextAuth from "next-auth";
import { authCallbacks, authPages, authSession } from "@/auth.callbacks";

const { auth } = NextAuth({
  providers: [],
  pages: authPages,
  session: authSession,
  callbacks: authCallbacks,
  trustHost: true,
});

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard");

  if (isDashboardRoute && !isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return Response.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
