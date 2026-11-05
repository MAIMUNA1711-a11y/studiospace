# StudioSpace – API Server

Express + TypeScript + MongoDB REST API for **StudioSpace**, a peer-to-peer creative workspace and production studio sharing platform.
Identity comes from **Better Auth** (running on the Next.js client); this server only **verifies** the JWTs it issues.

## How authentication works (Challenge 1)

```
Browser ──(HTTPOnly Better Auth session cookie)──▶ Next.js (same origin)
Next.js server-side proxy: reads the session, mints a short-lived JWT with Better Auth's `jwt` plugin
Next.js ──(Authorization: Bearer <JWT>, server-to-server)──▶ Express
Express: verifies signature via Better Auth's JWKS endpoint, checks exp / iss / aud, sets req.user
```

* The JWT is never readable by browser JavaScript; the browser only holds the HTTPOnly session cookie.
* Express also accepts the JWT from an HTTPOnly cookie named by `JWT_COOKIE_NAME`.
* Algorithms are pinned (`EdDSA`, `ES256`, `RS256`); `alg: none`, tampered, expired, wrong-issuer/audience and foreign-key tokens are rejected with **401**.
* Studio owner / booker identity is always taken from the verified token, never from the request body.

## Setup

```bash
npm install
cp .env.example .env     # fill in MONGODB_URI etc. – never commit .env
npm run seed             # optional: demo studios + reviews
npm run dev              # http://localhost:5000
npm test                 # needs a reachable MongoDB (see below)
npm run build && npm start
```

Tests need a MongoDB instance. By default they use `mongodb://127.0.0.1:27018` and a throwaway database named `studiospace_test_<pid>` (dropped afterwards). Override with `TEST_MONGODB_URI`.

### First-time MongoDB Atlas setup (beginner steps)

1. Create a free account at <https://www.mongodb.com/cloud/atlas/register> and create a **free (M0) cluster**.
2. **Database Access** → *Add New Database User* → choose a username and password (letters/numbers only is easiest). Give it *Read and write to any database*.
3. **Network Access** → *Add IP Address* → *Add Current IP Address* (for deployment on Render also add `0.0.0.0/0`).
4. **Database** → *Connect* → *Drivers* → copy the `mongodb+srv://...` string.
5. Create your private env file: `copy .env.example .env` (Windows cmd) or `cp .env.example .env`. Open it in **VS Code** (Notepad may save it as `.env.txt`).
6. Set `MONGODB_URI` to the copied string with `<password>` replaced by your real password (remove the `< >` brackets). Optionally add the database name before the `?`, e.g. `...mongodb.net/studiospace?retryWrites=...`.
7. Run `npm run seed` then `npm run dev`. You should see `StudioSpace API listening on port 5000`.

Common errors: `EBADNAME` = placeholder text still in `MONGODB_URI`; `bad auth` = wrong username/password; `MongoServerSelectionError` = your IP is not allowed in Network Access.

### Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP port (Render injects this) |
| `MONGODB_URI`, `MONGODB_DB_NAME` | MongoDB Atlas connection (use the **same** DB as Better Auth) |
| `CLIENT_URL` | Comma-separated allowed CORS origins |
| `JWKS_URL` | Better Auth JWKS endpoint, e.g. `https://<client>/api/auth/jwks` |
| `JWT_ISSUER`, `JWT_AUDIENCE` | Better Auth baseURL (its default issuer/audience) |
| `JWT_COOKIE_NAME` | Optional cookie name that may carry the JWT |
| `BOOKING_UTC_OFFSET_MINUTES` | Zone used to reject past slots (Dhaka = `360`) |

## API

All responses: `{ success, message?, data?, errors? }`. 🔒 = requires a valid JWT.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/auth/verify` 🔒 | Returns the verified user |
| GET | `/api/studios` | `search, category, minPrice, maxPrice, minRating, sort(newest/oldest/price_asc/price_desc/rating), page, limit` |
| GET | `/api/studios/featured` | Top 6 (rating, then newest) via `.limit(6)` |
| GET | `/api/studios/mine` 🔒 | `ownerEmail` match |
| GET | `/api/studios/:id` | |
| POST | `/api/studios` 🔒 | 201 |
| PUT | `/api/studios/:id` 🔒 | Owner only (403 otherwise) |
| DELETE | `/api/studios/:id` 🔒 | Owner only; cancels open bookings |
| GET / POST | `/api/studios/:id/reviews` | POST 🔒, one review per user, not on own studio |
| POST | `/api/bookings` 🔒 | Status `Pending`; price computed server-side |
| GET | `/api/bookings/mine` 🔒 | Caller's bookings |
| GET | `/api/bookings/host` 🔒 | Bookings on caller's studios |
| GET | `/api/bookings/availability?studioId&date` | Confirmed time ranges only (no personal data) |
| PATCH | `/api/bookings/:id/cancel` 🔒 | Booker, `Pending` only |
| PATCH | `/api/bookings/:id/status` 🔒 | Host: Pending→Confirmed/Cancelled, Confirmed→Completed/Cancelled |
| GET/POST/DELETE | `/api/wishlist[/:studioId]` 🔒 | Optional feature |
| GET | `/api/dashboard/stats` 🔒 | Counts / spend / earnings |

## Double-booking prevention (Challenge 2)

On `POST /api/bookings` the server queries **Confirmed** bookings for the same studio and date:

```
existing.startMinutes < newEnd  AND  existing.endMinutes > newStart
```

Any hit returns **409** with a clear message. Slots are half-open, so back-to-back bookings (end 12:00 / start 12:00) are allowed. Confirming a booking re-runs the same check (excluding itself).

Known limitation: two hosts-confirmations racing in the same millisecond could both pass the check, because MongoDB has no cross-document constraint for ranges. A single host confirming their own bookings (the normal case) is safe; a transaction on a replica set would close this gap.

## Structure

```
src/
  config/       env validation, Mongo connection + indexes
  middleware/   authenticate (JWT), validate (zod), error handling
  routes/ controllers/ services/   thin HTTP layer → business logic
  validators/   zod schemas
  utils/        jwt, time/overlap, ObjectId parsing, errors
  scripts/seed.ts
tests/          unit tests + API integration tests (62 tests)
```

## Deploying to Render

Build: `npm install && npm run build` · Start: `npm start` · set every variable above in the Render dashboard.
