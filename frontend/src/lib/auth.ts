import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { createBackendAuthToken } from "@/lib/backend-auth-token";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID || "", clientSecret: process.env.GOOGLE_CLIENT_SECRET || "" })],
  callbacks: {
    async jwt({ token }) {
      if (token.sub) token.backendToken = createBackendAuthToken(token.sub, token.email);
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      session.backendToken = typeof token.backendToken === "string" ? token.backendToken : undefined;
      return session;
    },
  },
};
