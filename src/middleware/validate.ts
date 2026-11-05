import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Source = "body" | "query" | "params";

/** Parses + sanitizes a request part with zod; unknown keys are stripped. ZodErrors become 400s in errorHandler. */
export const validate =
  (schema: ZodType, source: Source = "body"): RequestHandler =>
  (req, _res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === "query") {
        // req.query may be a getter in some Express versions; define a value property instead.
        Object.defineProperty(req, "query", { value: parsed, writable: true, configurable: true });
      } else {
        (req as unknown as Record<string, unknown>)[source] = parsed;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
