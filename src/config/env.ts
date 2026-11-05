import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, "MONGODB_URI is required")
    .refine(
      (v) => /^mongodb(\+srv)?:\/\//.test(v),
      "MONGODB_URI must start with mongodb+srv:// (Atlas) or mongodb:// (local)",
    )
    .refine(
      (v) => !/[<>]/.test(v),
      "MONGODB_URI still contains placeholder text such as <user>, <password> or <cluster>. Paste your real Atlas connection string and remove the < > brackets",
    ),
  MONGODB_DB_NAME: z.string().min(1).default("studiospace"),
  CLIENT_URL: z.string().min(1, "CLIENT_URL is required"),
  JWKS_URL: z.string().url("JWKS_URL must be a valid URL"),
  JWT_ISSUER: z.preprocess(emptyToUndefined, z.string().optional()),
  JWT_AUDIENCE: z.preprocess(emptyToUndefined, z.string().optional()),
  JWT_COOKIE_NAME: z.string().min(1).default("studiospace_token"),
  BOOKING_UTC_OFFSET_MINUTES: z.coerce.number().int().min(-720).max(840).default(0),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  // Fail fast with a readable message; never print the values themselves.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  allowedOrigins: parsed.data.CLIENT_URL.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
};
