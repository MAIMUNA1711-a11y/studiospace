import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { MongoServerError } from "mongodb";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return res.status(400).json({ success: false, message: errors[0]?.message ?? "Validation failed", errors });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ success: false, message: err.message, ...(err.details ? { errors: err.details } : {}) });
  }
  if (err instanceof MongoServerError && err.code === 11000) {
    return res.status(409).json({ success: false, message: "A record with these details already exists" });
  }
  // body-parser errors (malformed JSON, payload too large)
  const status = (err as { status?: number })?.status;
  if (status === 400 || status === 413) {
    return res.status(status).json({ success: false, message: status === 413 ? "Payload too large" : "Malformed JSON body" });
  }

  console.error("[unhandled]", err);
  res.status(500).json({
    success: false,
    message: env.isProduction ? "Internal server error" : String((err as Error)?.message ?? err),
  });
};
