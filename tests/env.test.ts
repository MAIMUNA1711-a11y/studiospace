import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

/** Loads src/config/env.ts in a fresh process with the given MONGODB_URI. */
function loadEnv(uri: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "-e", "require('./src/config/env')"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      MONGODB_URI: uri,
      CLIENT_URL: "http://localhost:3000",
      JWKS_URL: "http://localhost:3000/api/auth/jwks",
    },
  });
}

describe("MONGODB_URI validation", () => {
  it("rejects the untouched .env.example placeholder with a helpful message", () => {
    const r = loadEnv("mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /placeholder text/i);
  });
  it("rejects a URI that does not start with mongodb:// or mongodb+srv://", () => {
    const r = loadEnv("localhost:27017");
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /must start with mongodb/i);
  });
  it("accepts a well-formed Atlas-style and local URI", () => {
    assert.equal(loadEnv("mongodb+srv://myUser:myPass123@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority").status, 0);
    assert.equal(loadEnv("mongodb://127.0.0.1:27017").status, 0);
  });
});
