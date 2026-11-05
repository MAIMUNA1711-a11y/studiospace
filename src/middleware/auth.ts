import type { Request, RequestHandler } from "express";
import { env } from "../config/env";
import { verifyToken } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const t = header.slice(7).trim();
    if (t) return t;
  }
  const cookieToken = req.cookies?.[env.JWT_COOKIE_NAME];
  return typeof cookieToken === "string" && cookieToken ? cookieToken : undefined;
}

/** Rejects with 401 unless a valid JWT is supplied. Sets req.user from the verified claims. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(ApiError.unauthorized());
  try {
    req.user = await verifyToken(token);
    next();
  } catch {
    // Deliberately generic: do not reveal why verification failed.
    next(ApiError.unauthorized("Invalid or expired token"));
  }
};

/** Use after `authenticate` inside controllers/services. */
export function requireUser(req: Request) {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
