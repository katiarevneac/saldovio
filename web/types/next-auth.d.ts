import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  interface User {
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    sessionVersion: number;
  }
}

// next-auth v5.0.0-beta.32's actual callback signatures (@auth/core/index.d.ts)
// import JWT from "@auth/core/jwt" directly, not the "next-auth/jwt" re-export
// above — augmenting only "next-auth/jwt" leaves the real jwt() callback's
// `token` param without these fields (verified empirically: `declare module
// "next-auth/jwt"` alone left auth.ts's jwt() callback unable to pass `token`
// to a function expecting `{ id?: string; sessionVersion?: number }`, a
// TS2559 "no properties in common" weak-type error, since @auth/core/jwt's
// JWT was still just Record<string, unknown> & DefaultJWT). Both augmentations
// are kept: "next-auth/jwt" for code that imports the type from there, and
// this one for the module @auth/core's own types actually resolve through.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    sessionVersion: number;
  }
}
