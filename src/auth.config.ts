import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authCallbacks, authPages, authSession } from "@/auth.callbacks";

export default {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = String(credentials.email);
        const password = String(credentials.password);

        const { getPrisma } = await import("@/lib/prisma");
        const bcrypt = await import("bcryptjs");
        const prisma = getPrisma();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          plan: user.plan,
          stripeCustomerId: user.stripeCustomerId,
        };
      },
    }),
  ],
  pages: authPages,
  session: authSession,
  callbacks: authCallbacks,
  trustHost: true,
} satisfies NextAuthConfig;
