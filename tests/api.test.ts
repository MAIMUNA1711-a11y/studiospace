import "./setup";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { createApp } from "../src/app";

type PrivKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
import { closeDb, connectDb, ensureIndexes, getDb } from "../src/config/db";
import { setKeyResolver } from "../src/utils/jwt";

const ISS = process.env.JWT_ISSUER!;
let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let privateKey: PrivKey;

async function sign(email: string, opts: { name?: string; exp?: string; iss?: string; aud?: string; key?: PrivKey; kid?: string } = {}) {
  return new SignJWT({ id: `id-${email}`, email, name: opts.name ?? email.split("@")[0] })
    .setProtectedHeader({ alg: "EdDSA", kid: opts.kid ?? "test-key" })
    .setSubject(`id-${email}`)
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? ISS)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey);
}

async function api(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json, headers: res.headers };
}

const studioPayload = (over: Record<string, unknown> = {}) => ({
  title: "Integration Test Studio",
  category: "Photo Studio",
  hourlyRate: 50,
  securityDeposit: 100,
  maxCapacity: 10,
  location: "Banani, Dhaka",
  imageUrl: "https://example.com/studio.jpg",
  amenities: ["Wi-Fi", "Strobe lights"],
  overview: "A spacious studio used for automated integration testing.",
  ...over,
});

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

let alice: string, bob: string, carol: string; // tokens
let studioId: string;

before(async () => {
  const { publicKey, privateKey: pk } = await generateKeyPair("EdDSA", { extractable: true });
  privateKey = pk;
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "EdDSA", use: "sig" };
  setKeyResolver(createLocalJWKSet({ keys: [jwk] }));

  await connectDb();
  await getDb().dropDatabase();
  await ensureIndexes();

  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  alice = await sign("alice@test.com", { name: "Alice Host" });
  bob = await sign("bob@test.com", { name: "Bob Guest" });
  carol = await sign("carol@test.com", { name: "Carol Guest" });
});

after(async () => {
  server.close();
  await getDb().dropDatabase();
  await closeDb();
});

describe("health + 404", () => {
  it("GET /api/health is public", async () => {
    const r = await api("GET", "/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.status, "ok");
  });
  it("unknown routes return JSON 404", async () => {
    const r = await api("GET", "/api/nope");
    assert.equal(r.status, 404);
    assert.equal(r.json.success, false);
  });
  it("malformed JSON body returns 400, not 500", async () => {
    const res = await fetch(base + "/api/studios", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${alice}` }, body: "{bad" });
    assert.equal(res.status, 400);
  });
});

describe("Challenge 1: JWT security (401 on every protected mutation)", () => {
  const protectedCalls: [string, string][] = [
    ["POST", "/api/studios"],
    ["PUT", "/api/studios/507f1f77bcf86cd799439011"],
    ["DELETE", "/api/studios/507f1f77bcf86cd799439011"],
    ["POST", "/api/bookings"],
    ["GET", "/api/bookings/mine"],
    ["PATCH", "/api/bookings/507f1f77bcf86cd799439011/cancel"],
    ["GET", "/api/studios/mine"],
    ["GET", "/api/auth/verify"],
    ["GET", "/api/dashboard/stats"],
    ["POST", "/api/wishlist/507f1f77bcf86cd799439011"],
  ];

  it("no token -> 401 for all protected endpoints", async () => {
    for (const [m, p] of protectedCalls) {
      const r = await api(m, p, { body: m === "GET" || m === "DELETE" ? undefined : {} });
      assert.equal(r.status, 401, `${m} ${p}`);
    }
  });

  it("garbage / tampered / expired / wrong-issuer / wrong-audience / foreign-key tokens -> 401", async () => {
    const good = await sign("alice@test.com");
    const tampered = good.slice(0, -4) + (good.endsWith("AAAA") ? "BBBB" : "AAAA");
    const { privateKey: otherKey } = await generateKeyPair("EdDSA");
    const bad: Record<string, string> = {
      garbage: "not.a.jwt",
      tampered,
      expired: await sign("alice@test.com", { exp: "-1h" }),
      wrongIssuer: await sign("alice@test.com", { iss: "https://evil.example" }),
      wrongAudience: await sign("alice@test.com", { aud: "https://evil.example" }),
      signedByAttackerKey: await sign("alice@test.com", { key: otherKey }),
      unknownKid: await sign("alice@test.com", { kid: "other" }),
      // alg:none forgery
      algNone: `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ email: "alice@test.com", sub: "x", iss: ISS, aud: ISS })).toString("base64url")}.`,
    };
    for (const [label, token] of Object.entries(bad)) {
      const r = await api("POST", "/api/studios", { token, body: studioPayload() });
      assert.equal(r.status, 401, label);
    }
    const ok = await api("GET", "/api/auth/verify", { token: good });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.user.email, "alice@test.com");
  });

  it("accepts the JWT from an HTTPOnly-style cookie too", async () => {
    const r = await api("GET", "/api/auth/verify", { headers: { Cookie: `studiospace_token=${alice}` } });
    assert.equal(r.status, 200);
  });

  it("response never leaks the token or internal errors", async () => {
    const r = await api("POST", "/api/studios", { token: "x.y.z", body: studioPayload() });
    assert.ok(!JSON.stringify(r.json).includes("x.y.z"));
  });
});

describe("Studios CRUD + ownership", () => {
  it("rejects invalid payloads with 400 and a field message", async () => {
    const r = await api("POST", "/api/studios", { token: alice, body: studioPayload({ category: "Nope", hourlyRate: -5 }) });
    assert.equal(r.status, 400);
    assert.ok(r.json.errors.length >= 2);
  });

  it("creates a studio; owner comes from the token even if the body tries to spoof it", async () => {
    const r = await api("POST", "/api/studios", { token: alice, body: studioPayload({ ownerEmail: "evil@x.com", ownerName: "Evil", rating: 5 }) });
    assert.equal(r.status, 201);
    studioId = r.json.data._id;
    assert.equal(r.json.data.ownerEmail, "alice@test.com");
    assert.equal(r.json.data.ownerName, "Alice Host");
    assert.equal(r.json.data.rating, 0);
  });

  it("GET /api/studios/:id is public; bad id -> 400; unknown id -> 404", async () => {
    assert.equal((await api("GET", `/api/studios/${studioId}`)).status, 200);
    assert.equal((await api("GET", "/api/studios/not-an-id")).status, 400);
    assert.equal((await api("GET", "/api/studios/507f1f77bcf86cd799439011")).status, 404);
  });

  it("another user cannot update or delete (403) and the studio is untouched", async () => {
    const put = await api("PUT", `/api/studios/${studioId}`, { token: bob, body: studioPayload({ title: "Hijacked" }) });
    assert.equal(put.status, 403);
    const del = await api("DELETE", `/api/studios/${studioId}`, { token: bob });
    assert.equal(del.status, 403);
    const still = await api("GET", `/api/studios/${studioId}`);
    assert.equal(still.json.data.title, "Integration Test Studio");
  });

  it("owner can update; owner fields cannot be changed through update", async () => {
    const r = await api("PUT", `/api/studios/${studioId}`, { token: alice, body: studioPayload({ title: "Renamed Studio", hourlyRate: 60, ownerEmail: "bob@test.com" }) });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.title, "Renamed Studio");
    assert.equal(r.json.data.hourlyRate, 60);
    assert.equal(r.json.data.ownerEmail, "alice@test.com");
  });

  it("DELETE/PUT with bad or unknown ids -> 400 / 404", async () => {
    assert.equal((await api("DELETE", "/api/studios/zzz", { token: alice })).status, 400);
    assert.equal((await api("DELETE", "/api/studios/507f1f77bcf86cd799439011", { token: alice })).status, 404);
    assert.equal((await api("PUT", "/api/studios/507f1f77bcf86cd799439011", { token: alice, body: studioPayload() })).status, 404);
  });

  it("/mine returns only the caller's studios", async () => {
    await api("POST", "/api/studios", { token: bob, body: studioPayload({ title: "Bob's Podcast Room", category: "Podcast Room" }) });
    const a = await api("GET", "/api/studios/mine", { token: alice });
    const b = await api("GET", "/api/studios/mine", { token: bob });
    assert.ok(a.json.data.every((s: any) => s.ownerEmail === "alice@test.com"));
    assert.ok(b.json.data.every((s: any) => s.ownerEmail === "bob@test.com"));
    assert.equal(a.json.data.length, 1);
    assert.equal(b.json.data.length, 1);
  });
});

describe("Studio listing: search / filter / sort / pagination / featured", () => {
  before(async () => {
    for (let i = 1; i <= 8; i++) {
      await api("POST", "/api/studios", {
        token: carol,
        body: studioPayload({ title: `Carol Sound Room ${i}`, category: i % 2 ? "Sound Stage" : "Music Suite", hourlyRate: 10 * i, location: i === 3 ? "Gulshan, Dhaka" : "Uttara, Dhaka" }),
      });
    }
  });

  it("category filter", async () => {
    const r = await api("GET", "/api/studios?category=Sound%20Stage");
    assert.ok(r.json.data.length === 4 && r.json.data.every((s: any) => s.category === "Sound Stage"));
  });
  it("search matches title/location case-insensitively; regex chars are escaped", async () => {
    assert.equal((await api("GET", "/api/studios?search=gulshan")).json.data.length, 1);
    assert.equal((await api("GET", "/api/studios?search=.*")).json.data.length, 0);
    assert.equal((await api("GET", "/api/studios?search=podcast")).json.data.length, 1);
  });
  it("price range + sort", async () => {
    const r = await api("GET", "/api/studios?category=Music%20Suite&minPrice=20&maxPrice=60&sort=price_desc");
    assert.deepEqual(r.json.data.map((s: any) => s.hourlyRate), [60, 40, 20]);
  });
  it("pagination metadata", async () => {
    const r = await api("GET", "/api/studios?limit=5&page=2");
    assert.equal(r.json.data.length, 5);
    assert.equal(r.json.pagination.total, 10);
    assert.equal(r.json.pagination.totalPages, 2);
  });
  it("empty result is 200 with []", async () => {
    const r = await api("GET", "/api/studios?search=zzzzzzz");
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data, []);
  });
  it("invalid query params -> 400", async () => {
    assert.equal((await api("GET", "/api/studios?limit=9999")).status, 400);
    assert.equal((await api("GET", "/api/studios?category=Bogus")).status, 400);
  });
  it("featured returns at most 6", async () => {
    const r = await api("GET", "/api/studios/featured");
    assert.equal(r.json.data.length, 6);
  });
});

describe("Bookings", () => {
  const date = future(30);
  let bookingA: string; // bob 10:00-12:00 on `date`

  it("creates a Pending booking; price is computed on the server (client price ignored)", async () => {
    const r = await api("POST", "/api/bookings", { token: bob, body: { studioId, bookingDate: date, startTime: "10:00", endTime: "12:30", totalPrice: 1, status: "Confirmed", userEmail: "evil@x.com" } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    bookingA = r.json.data._id;
    assert.equal(r.json.data.status, "Pending");
    assert.equal(r.json.data.durationHours, 2.5);
    assert.equal(r.json.data.totalPrice, 150); // 60/hr (after update) * 2.5
    assert.equal(r.json.data.securityDeposit, 100);
    assert.equal(r.json.data.userEmail, "bob@test.com");
    assert.equal(r.json.data.ownerEmail, "alice@test.com");
  });

  it("validation errors -> 400; past date -> 400; unknown studio -> 404; bad id -> 400", async () => {
    const mk = (over: object) => api("POST", "/api/bookings", { token: bob, body: { studioId, bookingDate: date, startTime: "14:00", endTime: "16:00", ...over } });
    assert.equal((await mk({ endTime: "14:00" })).status, 400);
    assert.equal((await mk({ startTime: "25:00" })).status, 400);
    assert.equal((await mk({ bookingDate: "2020-01-01" })).status, 400);
    assert.equal((await mk({ studioId: "507f1f77bcf86cd799439011" })).status, 404);
    assert.equal((await mk({ studioId: "nope" })).status, 400);
  });

  it("same user cannot stack overlapping open requests on one studio", async () => {
    const r = await api("POST", "/api/bookings", { token: bob, body: { studioId, bookingDate: date, startTime: "11:00", endTime: "13:00" } });
    assert.equal(r.status, 409);
  });

  it("Pending bookings do NOT block other users (only Confirmed do)", async () => {
    const r = await api("POST", "/api/bookings", { token: carol, body: { studioId, bookingDate: date, startTime: "11:00", endTime: "13:00" } });
    assert.equal(r.status, 201);
  });

  it("only the host can confirm (403 for others)", async () => {
    assert.equal((await api("PATCH", `/api/bookings/${bookingA}/status`, { token: bob, body: { status: "Confirmed" } })).status, 403);
    assert.equal((await api("PATCH", `/api/bookings/${bookingA}/status`, { token: alice, body: { status: "Bogus" } })).status, 400);
  });

  it("host confirms booking A (10:00-12:30)", async () => {
    const r = await api("PATCH", `/api/bookings/${bookingA}/status`, { token: alice, body: { status: "Confirmed" } });
    assert.equal(r.status, 200);
    assert.equal(r.json.data.status, "Confirmed");
  });

  describe("Challenge 2: double-booking prevention vs Confirmed 10:00-12:30", () => {
    const tryBook = (startTime: string, endTime: string, d = date, token = carol) =>
      api("POST", "/api/bookings", { token, body: { studioId, bookingDate: d, startTime, endTime } });

    it("partial overlap at the end -> 409 with a clear message", async () => {
      const r = await tryBook("12:00", "14:00");
      assert.equal(r.status, 409);
      assert.match(r.json.message, /no longer available/i);
    });
    it("partial overlap at the start -> 409", async () => assert.equal((await tryBook("09:00", "11:00")).status, 409));
    it("fully contained -> 409", async () => assert.equal((await tryBook("10:30", "11:30")).status, 409));
    it("fully enclosing -> 409", async () => assert.equal((await tryBook("08:00", "15:00")).status, 409));
    it("identical -> 409", async () => assert.equal((await tryBook("10:00", "12:30")).status, 409));
    // bob's only active booking that day is the Confirmed 10:00-12:30, so these isolate the adjacency rule
    it("adjacent after (starts exactly at 12:30) -> allowed", async () => assert.equal((await tryBook("12:30", "14:30", date, bob)).status, 201));
    it("adjacent before (ends exactly at 10:00) -> allowed", async () => assert.equal((await tryBook("08:00", "10:00", date, bob)).status, 201));
    it("different date -> allowed", async () => assert.equal((await tryBook("10:00", "12:00", future(31))).status, 201));
    it("different studio -> allowed", async () => {
      const other = await api("GET", "/api/studios/mine", { token: bob });
      const r = await api("POST", "/api/bookings", { token: carol, body: { studioId: other.json.data[0]._id, bookingDate: date, startTime: "10:00", endTime: "12:30" } });
      assert.equal(r.status, 201);
    });

    it("host cannot confirm a second booking that collides with a Confirmed one (409)", async () => {
      const mine = await api("GET", "/api/bookings/mine", { token: carol });
      const pendingOverlap = mine.json.data.find((b: any) => b.studioId && b.status === "Pending" && b.startTime === "11:00" && b.bookingDate === date);
      assert.ok(pendingOverlap, "expected carol's pending 11:00-13:00 booking");
      const r = await api("PATCH", `/api/bookings/${pendingOverlap._id}/status`, { token: alice, body: { status: "Confirmed" } });
      assert.equal(r.status, 409);
    });

    it("concurrent identical requests never both succeed against a confirmed slot", async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => tryBook("11:00", "12:00")));
      assert.ok(results.every((r) => r.status === 409));
    });
  });

  it("availability endpoint is public and exposes only confirmed time ranges", async () => {
    const r = await api("GET", `/api/bookings/availability?studioId=${studioId}&date=${date}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data, [{ startTime: "10:00", endTime: "12:30" }]);
    assert.equal((await api("GET", `/api/bookings/availability?studioId=${studioId}`)).status, 400);
  });

  it("/mine returns only the caller's bookings; /host only bookings on the caller's studios", async () => {
    const bobs = await api("GET", "/api/bookings/mine", { token: bob });
    assert.ok(bobs.json.data.every((b: any) => b.userEmail === "bob@test.com"));
    const host = await api("GET", "/api/bookings/host", { token: alice });
    assert.ok(host.json.data.length >= 2 && host.json.data.every((b: any) => b.ownerEmail === "alice@test.com"));
    assert.equal((await api("GET", "/api/bookings/host", { token: bob })).json.data.every((b: any) => b.ownerEmail === "bob@test.com"), true);
  });

  describe("cancellation rules", () => {
    let pendingId: string;
    before(async () => {
      const r = await api("POST", "/api/bookings", { token: bob, body: { studioId, bookingDate: future(40), startTime: "09:00", endTime: "11:00" } });
      pendingId = r.json.data._id;
    });
    it("another user cannot cancel (403)", async () => assert.equal((await api("PATCH", `/api/bookings/${pendingId}/cancel`, { token: carol })).status, 403));
    it("unknown / invalid id -> 404 / 400", async () => {
      assert.equal((await api("PATCH", "/api/bookings/507f1f77bcf86cd799439011/cancel", { token: bob })).status, 404);
      assert.equal((await api("PATCH", "/api/bookings/xyz/cancel", { token: bob })).status, 400);
    });
    it("owner cancels a Pending booking", async () => {
      const r = await api("PATCH", `/api/bookings/${pendingId}/cancel`, { token: bob });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.status, "Cancelled");
    });
    it("cannot cancel again, nor cancel a Confirmed booking (409)", async () => {
      assert.equal((await api("PATCH", `/api/bookings/${pendingId}/cancel`, { token: bob })).status, 409);
      assert.equal((await api("PATCH", `/api/bookings/${bookingA}/cancel`, { token: bob })).status, 409);
    });
    it("a cancelled slot frees up; invalid host transitions are rejected", async () => {
      assert.equal((await api("PATCH", `/api/bookings/${pendingId}/status`, { token: alice, body: { status: "Confirmed" } })).status, 409);
      assert.equal((await api("PATCH", `/api/bookings/${bookingA}/status`, { token: alice, body: { status: "Completed" } })).status, 200);
      assert.equal((await api("PATCH", `/api/bookings/${bookingA}/status`, { token: alice, body: { status: "Cancelled" } })).status, 409);
    });
  });
});

describe("Reviews", () => {
  it("authenticated user can review; ratings aggregate onto the studio", async () => {
    assert.equal((await api("POST", `/api/studios/${studioId}/reviews`, { body: { rating: 5, comment: "Great space!" } })).status, 401);
    assert.equal((await api("POST", `/api/studios/${studioId}/reviews`, { token: bob, body: { rating: 6, comment: "Great space!" } })).status, 400);
    assert.equal((await api("POST", `/api/studios/${studioId}/reviews`, { token: bob, body: { rating: 5, comment: "Great space!" } })).status, 201);
    assert.equal((await api("POST", `/api/studios/${studioId}/reviews`, { token: carol, body: { rating: 4, comment: "Very good studio." } })).status, 201);
    const s = await api("GET", `/api/studios/${studioId}`);
    assert.equal(s.json.data.rating, 4.5);
    assert.equal(s.json.data.reviewCount, 2);
    assert.equal((await api("GET", `/api/studios/${studioId}/reviews`)).json.data.length, 2);
  });
  it("duplicate review -> 409; reviewing your own studio -> 403", async () => {
    assert.equal((await api("POST", `/api/studios/${studioId}/reviews`, { token: bob, body: { rating: 1, comment: "Changed my mind" } })).status, 409);
    assert.equal((await api("POST", `/api/studios/${studioId}/reviews`, { token: alice, body: { rating: 5, comment: "I am great" } })).status, 403);
  });
});

describe("Wishlist + dashboard", () => {
  it("add (idempotent) / list / remove", async () => {
    assert.equal((await api("POST", `/api/wishlist/${studioId}`, { token: bob })).status, 201);
    assert.equal((await api("POST", `/api/wishlist/${studioId}`, { token: bob })).status, 201);
    assert.equal((await api("GET", "/api/wishlist", { token: bob })).json.data.length, 1);
    assert.equal((await api("GET", "/api/wishlist", { token: carol })).json.data.length, 0);
    assert.equal((await api("POST", "/api/wishlist/507f1f77bcf86cd799439011", { token: bob })).status, 404);
    assert.equal((await api("DELETE", `/api/wishlist/${studioId}`, { token: bob })).status, 200);
    assert.equal((await api("GET", "/api/wishlist", { token: bob })).json.data.length, 0);
  });
  it("dashboard stats reflect the caller's data", async () => {
    const a = await api("GET", "/api/dashboard/stats", { token: alice });
    assert.equal(a.status, 200);
    assert.equal(a.json.data.listings, 1);
    assert.ok(a.json.data.hosting.incoming >= 3);
    assert.ok(a.json.data.hosting.earnings >= 150);
    const b = await api("GET", "/api/dashboard/stats", { token: bob });
    assert.ok(b.json.data.bookingsMade.total >= 2);
  });
});

describe("CORS", () => {
  it("allows the configured client origin with credentials; omits headers for unknown origins", async () => {
    const ok = await api("GET", "/api/health", { headers: { Origin: "http://localhost:3000" } });
    assert.equal(ok.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(ok.headers.get("access-control-allow-credentials"), "true");
    const bad = await api("GET", "/api/health", { headers: { Origin: "https://evil.example" } });
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
  });
});

describe("Deleting a studio", () => {
  it("cancels its open bookings and removes it; subsequent GET is 404", async () => {
    const r = await api("DELETE", `/api/studios/${studioId}`, { token: alice });
    assert.equal(r.status, 200);
    assert.equal((await api("GET", `/api/studios/${studioId}`)).status, 404);
    const carols = await api("GET", "/api/bookings/mine", { token: carol });
    const forStudio = carols.json.data.filter((b: any) => b.studioId === studioId);
    assert.ok(forStudio.length > 0 && forStudio.every((b: any) => b.status === "Cancelled" || b.status === "Completed"));
  });
});
