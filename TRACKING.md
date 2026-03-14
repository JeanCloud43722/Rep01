# Technical Debt & Future Work

This file tracks known gaps, deferred improvements, and future feature ideas. Items here are intentional deferrals — not bugs.

---

## Active Technical Debt

### 1. Order Storage — In-Memory Only

**File:** `server/storage.ts` (`MemStorage`)

**Issue:** All orders, messages, offers, and service requests live in a `Map<string, Order>`. A server restart wipes everything.

**Impact:** Not suitable for production use. Any restart (deploy, crash, Replit idle timeout) loses all active orders.

**Migration Path:**
1. Create `DbStorage` class implementing `IStorage` in `server/storage.ts`
2. Use existing Drizzle setup (`server/db.ts`) and an `orders` table with JSONB columns for `messages`, `offers`, `serviceRequests`
3. Keep `MemStorage` for tests (already isolated via `reset()`)
4. Swap `export const storage = new MemStorage()` → `new DbStorage()`

No route changes required — all routes use the `IStorage` interface.

---

### 2. Rate Limiting — Not Implemented

**Files:** `server/routes.ts`, `server/index.ts`

**Issue:** No rate limiting on any endpoint.

**Impact:** Public endpoints (`/register`, `/service`, `/customer-message`, `/subscribe`) could be spammed.

**Fix:**
```bash
npm install express-rate-limit
```
Apply limiter to public write endpoints:
```typescript
import rateLimit from "express-rate-limit";
const publicLimiter = rateLimit({ windowMs: 60_000, max: 30 });
app.use("/api/orders/:id/service", publicLimiter);
app.use("/api/orders/:id/customer-message", publicLimiter);
```

---

### 3. `clientSessions` Map — Unbounded Growth

**File:** `server/routes.ts`

**Issue:** `clientSessions: Map<string, ClientSession>` accumulates session data for every WebSocket client that has ever connected and is never pruned.

**Impact:** Slow memory leak. In a busy restaurant, could grow to thousands of entries over a deployment lifetime.

**Fix:** Add a cleanup interval that deletes entries with `lastSeen` older than 1 hour:
```typescript
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, session] of clientSessions) {
    if (session.lastSeen < cutoff) clientSessions.delete(id);
  }
}, 3600_000);
```

---

### 4. Push Notification — No Delivery Confirmation

**File:** `server/routes.ts` (`sendSinglePushNotification`)

**Issue:** 3 push attempts are sent at 0s, 2s, 4s via fire-and-forget `setTimeout`. If attempt 1 succeeds, attempts 2 and 3 still fire.

**Impact:** Customer may receive up to 3 identical push notifications.

**Note:** The Service Worker uses `tag: "order-notification"` which causes the browser to replace an earlier notification with the new one, so the user generally only sees the latest. However, this does not prevent battery/network waste.

**Fix:** Track delivery status per attempt using the `Promise<boolean>` return value and skip later attempts on success.

---

### 5. Service Worker Cache Version — Manual Bump

**File:** `client/public/sw.js`

**Issue:** `CACHE_NAME = 'restaurant-buzzer-v3'` must be manually incremented on each deploy.

**Impact:** Clients served stale cached assets if developer forgets to bump the version.

**Fix:** Inject the version at build time using Vite's `define` plugin option:
```typescript
// vite.config.ts
define: { __SW_VERSION__: JSON.stringify(Date.now().toString()) }
```
Then in `sw.js`: `const CACHE_NAME = 'restaurant-buzzer-' + __SW_VERSION__;`

---

### 6. Polling Always Active

**Files:** `client/src/pages/admin.tsx`, `client/src/pages/customer.tsx`

**Issue:** `refetchInterval: 2000` polls the API every 2 seconds even when a WebSocket connection is healthy.

**Impact:** ~30 requests/minute per connected client; unnecessary server load.

**Fix:** Track WebSocket connection state in a React ref/state, and set `refetchInterval` to `false` when connected, re-enabling on disconnect.

---

## Future Features

### GraphQL Interface
Add a GraphQL layer over the existing `IStorage` interface if external API consumers emerge. The abstracted storage interface makes this straightforward without modifying routes.

### VAPID Key Rotation
Implement a key rotation mechanism that re-subscribes clients to new VAPID keys before invalidating old ones. Useful if a security audit requires key rotation without breaking existing subscriptions.

### Multi-Language Push Notifications
Currently all push notification text is hardcoded in English. If international expansion is needed, the push payload could include the customer's preferred language from the order object.

### WebSocket Connection Limits
Add per-IP connection limits to the WebSocket upgrade handler to prevent resource exhaustion from malicious clients.
