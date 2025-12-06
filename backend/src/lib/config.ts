import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string(),

  MISTRAL_API_KEY: z.string(),

  MONGODB_URI: z.string(),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),

  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string(),
});

export const config = envSchema.parse(process.env);

export const isProd = process.env.NODE_ENV === "production";
