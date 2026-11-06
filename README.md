# 🎥 StudioSpace – API Server

Express + TypeScript + MongoDB REST API for **StudioSpace**.

## 🔗 Live Links
- **Client (Live App):** https://studiospace-client-mim-57e8.vercel.app
- **Server (Backend API):** https://studiospace-server.onrender.com

## 🔐 Auth & Security
- **Better Auth & JWT:** Client issues JWT via Better Auth, Server verifies signature via JWKS / fallback secrets.
- **Header & Cookie Support:** Accepts `Bearer <token>` or HTTPOnly session cookies (`better-auth.session_token`).

## ⚡ Double-Booking Prevention
Query logic on booking creation/confirmation:
`existing.startMinutes < newEnd AND existing.endMinutes > newStart`
Overlaps return a **409 Conflict** response.

## 🛠️ Key Endpoints
- `GET /api/health` - Liveness check
- `GET /api/studios` - Search, filter, pagination
- `POST /api/bookings` 🔒 - Create booking
- `GET /api/bookings/mine` 🔒 - User bookings
- `GET /api/dashboard/stats` 🔒 - Host analytics

## 🚀 Setup & Deploy
```bash
npm install
cp .env.example .env
npm run dev