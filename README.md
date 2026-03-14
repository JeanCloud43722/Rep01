# Bistro Buzzer

A modern digital buzzer system for restaurants. Replaces physical buzzers with QR codes and real-time web notifications — no app install required for customers.

Customers scan a QR code to subscribe for alerts. Staff send instant or scheduled notifications when orders are ready. Works on all devices including iOS Safari via WebSocket fallback.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Deployment on Replit](#deployment-on-replit)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Client (React + Vite)         client/src/           │
│   pages/admin.tsx    — Staff dashboard               │
│   pages/customer.tsx — Customer order status page    │
│   lib/audio-manager  — Web Audio API sound cues      │
│   lib/notification-orchestrator — multi-channel      │
│   lib/i18n.ts        — EN/DE translations            │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP + WebSocket
┌─────────────────────▼───────────────────────────────┐
│  Server (Express + Node.js)    server/               │
│   routes.ts          — All REST API endpoints        │
│   storage.ts         — In-memory MemStorage (demo)   │
│   lib/state-machine  — Order status transition guard │
│   lib/logger.ts      — Winston structured logging    │
│   middleware/auth.ts — Session-based admin auth      │
│   env-validation.ts  — Startup env var checks        │
└─────────────────────┬───────────────────────────────┘
                      │ Drizzle ORM + Neon
┌─────────────────────▼───────────────────────────────┐
│  Database (PostgreSQL via Neon)                      │
│   admin_users        — Admin credentials (bcrypt)    │
│   user_sessions      — express-session store         │
└─────────────────────────────────────────────────────┘
```

| Module | Description |
|--------|-------------|
| `server/routes.ts` | All REST and WebSocket routes; push notification logic; scheduled notifications via `node-schedule` |
| `server/storage.ts` | `MemStorage` (in-memory, resets on restart) — swap for `DbStorage` in production |
| `server/lib/state-machine.ts` | Enforces valid order status transitions; throws `ValidationError` (HTTP 400) on violations |
| `server/lib/logger.ts` | Winston — JSON in production, colorized in dev; sanitizes sensitive fields |
| `server/lib/sanitize.ts` | Input sanitization applied to all user-supplied text fields |
| `server/env-validation.ts` | Validates all env vars at startup; exits early with clear messages on failure |
| `server/middleware/auth.ts` | `requireAuth` middleware; session-based (no JWT) |
| `client/public/sw.js` | Service Worker for push notifications and PWA offline caching |
| `shared/schema.ts` | Zod schemas and Drizzle table definitions shared by client and server |

For a deeper explanation of each module, see [`replit.md`](./replit.md).

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string. Auto-set when you bind a Replit database. |
| `SESSION_SECRET` | Recommended | Random hex (ephemeral) | Secret for signing `express-session` cookies. Use 64+ random hex chars. Sessions invalidate on restart without this. |
| `VAPID_PUBLIC_KEY` | Recommended | Generated (ephemeral) | Web Push VAPID public key. Generate once with `npx web-push generate-vapid-keys`. Existing push subscriptions break if this changes. |
| `VAPID_PRIVATE_KEY` | Recommended | Generated (ephemeral) | Web Push VAPID private key. Must be paired with `VAPID_PUBLIC_KEY`. |
| `ALLOWED_ORIGIN` | Optional | `*.replit.app,*.repl.co` | Comma-separated allowed origins for CORS/CSP. |
| `NODE_ENV` | Optional | Unset | `development` or `production`. Affects log format and cookie security. |
| `PORT` | Optional | `5000` | HTTP server port. |
| `LOG_LEVEL` | Optional | `info` | Winston log level: `debug`, `info`, `warn`, or `error`. Use `info` in production. |

### Generating VAPID Keys

```bash
npx web-push generate-vapid-keys
```

Copy the output into Replit Secrets as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Do this **once** and never change them — all existing push subscriptions are tied to these keys.

---

## Development

```bash
# Install dependencies
npm install

# Start development server (Express + Vite HMR on port 5000)
npm run dev

# Type-check without emitting
npm run check

# Push Drizzle schema changes to the database
npx drizzle-kit push

# Build for production
npm run build
```

---

## Testing

The test suite uses **Vitest** + **Supertest** for server-side API and unit testing.

```bash
# Run all tests once
npx vitest run

# Watch mode (re-runs on file changes)
npx vitest
```

**40 tests across 4 suites:**

| Suite | Tests |
|-------|-------|
| `state-machine.test.ts` | Pure unit tests — all valid/invalid transitions, `ValidationError` shape |
| `orders.test.ts` | Create, read, delete orders; register endpoint; auth guards |
| `auth.test.ts` | Login success/failure, session persistence, public vs protected routes |
| `messages.test.ts` | Staff and customer messages; empty/too-long input validation |

Tests use an in-memory session store and a dedicated test Express app, so they run without touching the production database beyond the `admin_users` table (read-only).

---

## Deployment on Replit

### Pre-Deployment Checklist

#### 1. Database

- [ ] Open **Tools → Database** in the Replit sidebar and bind a PostgreSQL database
- [ ] Confirm `DATABASE_URL` appears automatically in Secrets

#### 2. Secrets

Open **Tools → Secrets** and set the following:

| Secret | How to generate | Notes |
|--------|----------------|-------|
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | Required for stable sessions across restarts |
| `VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` | Set once; changing breaks all push subscriptions |
| `VAPID_PRIVATE_KEY` | Same command as above (paired key) | Set once; keep secret |
| `ALLOWED_ORIGIN` | Your deployment URL, e.g. `https://myapp.replit.app` | Restricts push/CORS to your domain |
| `LOG_LEVEL` | Literal `info` | Use `debug` only when actively investigating issues |

#### 3. Install & Verify

```bash
# Ensure all packages are installed
npm install

# Verify TypeScript compiles cleanly
npm run check

# Run the test suite — all 40 tests must pass
npx vitest run
```

#### 4. Deploy

Click **Deploy** in the Replit sidebar. Once deployed:

- Watch server logs for `Migrations complete` — confirms Drizzle ran schema migrations
- Watch for `Environment validated` — confirms all required secrets are present
- Watch for `Using persistent VAPID keys from environment` — confirms push will survive restarts

---

### First-Run Checklist

After your first successful deployment:

- [ ] **Change the default admin password immediately**
  Log in at `/admin` with `admin` / `admin123`, then update it via Settings
- [ ] Create a test order and open the customer page via the QR code
- [ ] On a mobile device, install the PWA ("Add to Home Screen") then test push notifications
- [ ] Test audio cues on both the admin dashboard and customer page
- [ ] Verify the state machine: attempt an invalid status transition — confirm you receive a clear HTTP 400 error message
- [ ] Test the service-request acknowledgment flow: customer presses "Call Waiter" → admin acknowledges → customer sees "Staff notified" in real time

---

### Post-Deployment Monitoring

- **Uptime monitoring** — Set up an external monitor to `GET /api/health` every 5 minutes. The endpoint checks database connectivity and reports `{ status: "ok", db: { connected: true, responseTimeMs: N } }`.
- **Error logs** — Watch for `logger.error` entries. Database failures and push delivery errors are always logged at ERROR level.
- **Rate limiting** — Spam-test endpoints to confirm 429 responses are returned after the rate-limit threshold.
- **Auto-cleanup** — Every hour the server removes completed orders older than 24 hours. Confirm with log entries matching `Auto-cleanup: removed completed orders`.
- **Session table size** — `pruneSessionInterval` is set to 900 seconds (15 min). Verify the `user_sessions` table stays small in the Replit Database panel.
- **Database size** — Monitor in the Replit Database panel. Should stay well under 1 GB with hourly cleanup active.

---

## API Reference

See [`replit.md`](./replit.md#api-endpoints) for the full endpoint table.

### Key Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | Public | Database health check |
| `POST` | `/api/auth/login` | — | Admin login |
| `GET` | `/api/orders` | Admin | List all orders |
| `POST` | `/api/orders` | Admin | Create new order |
| `GET` | `/api/orders/:id` | Public | Customer order status |
| `POST` | `/api/orders/:id/register` | Public | Auto-register customer visit |
| `POST` | `/api/orders/:id/trigger` | Admin | Send immediate notification |
| `POST` | `/api/orders/:id/schedule` | Admin | Schedule future notification |
| `POST` | `/api/orders/:id/service` | Public | Customer calls waiter |
| `POST` | `/api/orders/:id/service/:reqId/acknowledge` | Admin | Staff acknowledges service request |
| `WS` | `/ws/orders?id=:id` | Public | Real-time customer updates |
| `WS` | `/ws/admin` | Admin | Real-time admin dashboard updates |

---

## Order Status Flow

```
waiting ──► subscribed ──► scheduled ──► notified ──► completed
   │                                         ▲
   └─────────────────────────────────────────┘
              (direct notify, skips scheduled)
```

Invalid transitions return HTTP 400 with a message listing the allowed next states.

---

## License

MIT
