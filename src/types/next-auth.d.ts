import type { DefaultSession } from "next-auth";
import type { PlanTier } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: PlanTier;
      stripeCustomerId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    plan?: PlanTier;
    stripeCustomerId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    plan?: PlanTier;
    stripeCustomerId?: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    plan?: PlanTier;
    stripeCustomerId?: string | null;
  }
}
