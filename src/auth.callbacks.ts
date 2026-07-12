import type { NextAuthConfig } from "next-auth";
import type { PlanTier } from "@prisma/client";

export const authCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
  jwt({ token, user }) {
    if (user) {
      token.id = user.id;
      token.plan = user.plan;
      token.stripeCustomerId = user.stripeCustomerId ?? null;
    }
    return token;
  },
  session({ session, token }) {
    if (session.user) {
      session.user.id = token.id as string;
      session.user.plan = (token.plan as PlanTier) ?? "FREE";
      session.user.stripeCustomerId =
        (token.stripeCustomerId as string | null) ?? null;
    }
    return session;
  },
};

export const authPages = {
  signIn: "/login",
} as const;

export const authSession = {
  strategy: "jwt",
} as const satisfies NextAuthConfig["session"];
