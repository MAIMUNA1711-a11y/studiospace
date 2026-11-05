import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { env } from "../config/env";
import type { AuthUser } from "../types";

let resolver: JWTVerifyGetKey | null = null;

/** Keys are fetched (and cached/rotated) from Better Auth's JWKS endpoint. Nothing secret lives here. */
function getResolver(): JWTVerifyGetKey {
  if (!resolver) resolver = createRemoteJWKSet(new URL(env.JWKS_URL));
  return resolver;
}

/** Test hook: inject a local key set. */
export function setKeyResolver(r: JWTVerifyGetKey | null) {
  resolver = r;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Cryptographically verifies a JWT (signature via JWKS, expiry, issuer, audience)
 * and maps its claims to an AuthUser. Throws on any failure.
 */
export async function verifyToken(token: string): Promise<AuthUser> {
  const { payload } = await jwtVerify(token, getResolver(), {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ["EdDSA", "ES256", "RS256"], // never accept "none" or HMAC here
  });

  const id = str(payload.id) ?? str(payload.sub);
  const email = str(payload.email)?.toLowerCase();
  if (!id || !email) throw new Error("Token is missing required identity claims");

  return { id, email, name: str(payload.name) ?? email.split("@")[0], image: str(payload.image) };
}
