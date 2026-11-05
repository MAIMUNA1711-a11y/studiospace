import { z } from "zod";

/** Treat "" (empty query-string values) as "not provided". */
export const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .url("Must be a valid URL")
  .refine((u) => /^https?:\/\//i.test(u), "URL must start with http:// or https://");
