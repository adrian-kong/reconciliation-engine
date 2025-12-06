import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { db } from "./db.js";

export const authClient = betterAuth({
  database: mongodbAdapter(db),

  // Email/password authentication (login only, accounts are seeded)
  emailAndPassword: {
    enabled: true,
  },

  // Google OAuth
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // Organization plugin for multi-tenancy
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
    }),
  ],

  // Trusted origins for CORS
  trustedOrigins: ["http://localhost:5173"],

  // Session configuration
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
});

export type Session = ReturnType<typeof betterAuth>["$Infer"]["Session"];
