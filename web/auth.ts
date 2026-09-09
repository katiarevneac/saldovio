import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { FINANCE_API_URL } from "@/lib/config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Auth.js runs server-side in web/, but it must not query
        // Postgres directly — Finance API owns all DB access. It calls
        // the Finance API's own login endpoint instead, same as any
        // other client would.
        const response = await fetch(`${FINANCE_API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: credentials?.email,
            password: credentials?.password,
          }),
        });

        if (!response.ok) return null;
        return await response.json();
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string;
      return session;
    },
  },
});
