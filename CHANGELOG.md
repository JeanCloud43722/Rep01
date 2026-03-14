# Changelog

All notable changes are documented here.

---

## [2.0.0] — 2026-03-14

### Summary
Full production hardening of the original MVP. 28 optimization passes applied across security, reliability, observability, testing, and developer experience.

---

### Added

#### Infrastructure
- **PostgreSQL + Drizzle ORM**: `admin_users` and `user_sessions` tables backed by Neon serverless PostgreSQL. Schema defined in `shared/schema.ts`; migrations run at startup via `server/db.ts`
- **Env validation**: `server/env-validation.ts` validates all required/optional env vars at startup; process exits with a clear error message if `DATABASE_URL` is missing
- **Winston structured logging**: `server/lib/logger.ts` — JSON format in production, colorized in development; sensitive-field redaction; configurable via `LOG_LEVEL` env var; replaces all `console.*` calls in server code

#### Security
- **Helmet**: Strict HTTP security headers (CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`) applied at server startup
- **Input sanitization**: `server/lib/sanitize.ts` strips HTML/script tags from all user-supplied text before storage
- **Session auth**: `server/middleware/auth.ts` — `requireAuth` middleware protecting all admin routes; `connect-pg-simple` session store; bcrypt cost factor 12
- **Admin login/logout**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` endpoints

#### Order Management
- **State machine**: `server/lib/state-machine.ts` — `VALID_TRANSITIONS` map, `isValidTransition()`, `assertValidTransition()`. Throws `ValidationError` (HTTP 400) on invalid transitions; all mutating routes call `assertValidTransition` before modifying state
- **Order complete endpoint**: `POST /api/orders/:id/complete` — `notified → completed` transition
- **Service request acknowledgment**: `POST /api/orders/:id/service/:requestId/acknowledge` — stamps `acknowledgedAt`; customer UI shows "Staff notified" in real time
- **Auto-cleanup**: Hourly interval deletes completed orders older than 24 hours; manual trigger via `POST /api/orders/cleanup`
- **Staff notes**: `PATCH /api/orders/:id/notes` — admin-only order notes field
- **Offers**: `POST /api/orders/:id/offers` — add special offers to an order

#### Real-time
- **WebSocket heartbeat/keep-alive**: 30-second ping/pong; unresponsive connections terminated
- **Client reconnection with backoff**: 1s→2s→4s→...→30s max, up to 10 attempts
- **Page Visibility API**: Auto-reconnect and sync on tab foreground
- **Admin WebSocket** (`/ws/admin`): Real-time dashboard updates for all orders

#### Notifications
- **Push retry**: 3 push notification attempts at 0s, 2s, 4s for `trigger` and `message` endpoints
- **VAPID key persistence**: Env vars `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`; warns if ephemeral
- **Scheduled notifications**: `POST /api/orders/:id/schedule` — `node-schedule` job; survives restart via `restoreScheduledNotifications()`
- **Health endpoint**: `GET /api/health` — database connectivity check with response time

#### Frontend
- **i18n (EN/DE)**: Language toggle on customer page, localStorage persistence; `client/src/lib/i18n.ts`
- **Audio Manager**: 7 sound cues via Web Audio API; iOS Safari compatible; `client/src/lib/audio-manager.ts`
- **Device capability detection**: `client/src/lib/device-capabilities.ts`
- **Notification Orchestrator**: Multi-channel routing (audio, push, haptic, visual); `client/src/lib/notification-orchestrator.ts`
- **PWA**: `manifest.json`, service worker caching, iOS install prompt
- **QR Scanner**: `html5-qrcode` with photo upload fallback
- **IndexedDB offline storage**: `client/src/lib/offline-storage.ts`
- **Bidirectional messaging**: Customer → staff via `POST /api/orders/:id/customer-message`; real-time in admin dashboard

#### Testing
- **Vitest test suite**: 40 tests across 4 files
  - `server/__tests__/state-machine.test.ts` — 15 tests
  - `server/__tests__/orders.test.ts` — 10 tests
  - `server/__tests__/auth.test.ts` — 6 tests
  - `server/__tests__/messages.test.ts` — 9 tests
- **Test helpers**: `server/test-helper.ts` — `createTestApp()`, `createLoggedInAgent()`, `closeTestServer()`
- **Storage isolation**: `MemStorage.reset()` + `server/test-setup.ts` `beforeEach` hook

#### Documentation
- **README.md**: Architecture overview, security section, full env var table, development/testing/deployment guides, complete API reference
- **ARCHITECTURE.md**: Comprehensive module reference (16 sections); updated for all new features
- **TRACKING.md**: Remaining technical debt and future improvements

---

### Changed

- Admin routes now require session authentication (previously unprotected)
- `ServiceRequest` schema gained `acknowledgedAt: string | null` field
- Server bootstrap sequence rewritten to include env validation, migrations, and VAPID key setup before routes
- `console.*` calls replaced with Winston logger throughout server code

---

### Fixed

- VAPID key conversion for proper push subscription (base64url encoding)
- iOS Safari AudioContext compliance (silent audio unlock trick)
- WebSocket connections dropping silently on iOS background tab throttling
