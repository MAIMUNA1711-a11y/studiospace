import type { Request, RequestHandler } from "express";
import { verifyToken } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";

function extractToken(req: Request): string | undefined {
  // 1. Authorization header (Bearer token)
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const t = header.slice(7).trim();
    if (t) return t;
  }

  const cookies = (req as any).cookies || {};

  // 2. Read Better Auth session cookies
  const betterAuthToken =
    cookies["better-auth.session_token"] ||
    cookies["__Secure-better-auth.session_token"] ||
    cookies["session_token"];

  if (typeof betterAuthToken === "string" && betterAuthToken) {
    return betterAuthToken;
  }

  return undefined;
}

export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);

  // If no token at all, reject immediately
  if (!token) return next(ApiError.unauthorized("No authentication token provided"));

  try {
    const user = await verifyToken(token);
    (req as any).user = user;
    next();
  } catch (err: any) {
    // Return unauthorized error
    next(ApiError.unauthorized(err?.message || "Invalid or expired token"));
  }
};

export function requireUser(req: Request) {
  const user = (req as any).user;
  if (!user) throw ApiError.unauthorized("Authentication required");
  return user;
}