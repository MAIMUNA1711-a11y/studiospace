import type { Request, RequestHandler } from "express";
import { env } from "../config/env";
import { verifyToken } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";

function extractToken(req: Request): string | undefined {
  // 1. Authorization header check (Bearer token)
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const t = header.slice(7).trim();
    if (t) return t;
  }

  // 2. Custom JWT Cookie check from env
  if (env.JWT_COOKIE_NAME && req.cookies?.[env.JWT_COOKIE_NAME]) {
    const cookieToken = req.cookies[env.JWT_COOKIE_NAME];
    if (typeof cookieToken === "string" && cookieToken) return cookieToken;
  }

  // 3. Better Auth Standard & Secure Cookies check
  const betterAuthToken =
    req.cookies?.["better-auth.session_token"] ||
    req.cookies?.["__Secure-better-auth.session_token"] ||
    req.cookies?.["session_token"];

  if (typeof betterAuthToken === "string" && betterAuthToken) {
    return betterAuthToken;
  }

  return undefined;
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