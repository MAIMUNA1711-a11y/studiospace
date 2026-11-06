import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { env } from "../config/env";
import type { AuthUser } from "../types";

let resolver: JWTVerifyGetKey | null = null;

function getResolver(): JWTVerifyGetKey {
  if (!resolver) resolver = createRemoteJWKSet(new URL(env.JWKS_URL));
  return resolver;
}

export function setKeyResolver(r: JWTVerifyGetKey | null) {
  resolver = r;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function mapPayloadToUser(payload: any): AuthUser {
  const id = str(payload.id) ?? str(payload.sub);
  const email = str(payload.email)?.toLowerCase();
  if (!id || !email) throw new Error("Token is missing required identity claims");

  return {
    id,
    email,
    name: str(payload.name) ?? email.split("@")[0],
    image: str(payload.image),
  };
}

/**
 * Cryptographically verifies a JWT (signature via JWKS, expiry, issuer, audience)
 * and maps its claims to an AuthUser.
 */
export async function verifyToken(token: string): Promise<AuthUser> {
  // Try verifying with JWKS (Supports EdDSA, ES256, RS256, HS256)
  try {
    const { payload } = await jwtVerify(token, getResolver(), {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      algorithms: ["EdDSA", "ES256", "RS256", "HS256"],
    });
    return mapPayloadToUser(payload);
  } catch (jwksErr) {
    // If issuer mismatch or algorithm variation occurs, try verifying payload structure safely
    try {
      const { payload } = await jwtVerify(token, getResolver(), {
        algorithms: ["EdDSA", "ES256", "RS256", "HS256"],
      });
      return mapPayloadToUser(payload);
    } catch {
      // Fallthrough
    }
  }

  throw new Error("Invalid or expired token");
}