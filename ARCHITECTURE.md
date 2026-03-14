# Bistro Buzzer - Architecture Documentation

A comprehensive developer reference for the Restaurant Digital Buzzer System. This document maps every module, data model, protocol, and pipeline so future developers can extend or optimize the system without reverse-engineering the code.

---

## Table of Contents

1. [Data Models](#1-data-models)
2. [Storage Layer](#2-storage-layer)
3. [Server Entry Point](#3-server-entry-point)
4. [REST API Reference](#4-rest-api-reference)
5. [WebSocket Protocol](#5-websocket-protocol)
6. [Push Notification Pipeline](#6-push-notification-pipeline)
7. [Audio Manager](#7-audio-manager)
8. [Device Capabilities](#8-device-capabilities)
9. [Notification Orchestrator](#9-notification-orchestrator)
10. [WebSocket Manager (Client)](#10-websocket-manager-client)
11. [IndexedDB Offline Storage](#11-indexeddb-offline-storage)
12. [Service Worker](#12-service-worker)
13. [Frontend Pages](#13-frontend-pages)
14. [Configuration and Environment](#14-configuration-and-environment)
15. [Order Lifecycle and Status Flow](#15-order-lifecycle-and-status-flow)
16. [Known Optimization Opportunities](#16-known-optimization-opportunities)

---

## 1. Data Models

**File:** `shared/schema.ts`

All data models are defined as Zod schemas with inferred TypeScript types. They are shared between frontend and backend for end-to-end type safety.

### Enums

| Name | Values | Purpose |
|------|--------|---------|
| `orderStatusEnum` | `"waiting"`, `"subscribed"`, `"scheduled"`, `"notified"`, `"completed"` | Order lifecycle state machine |

### Core Schemas

#### `pushSubscriptionSchema`
```
{
  endpoint: string,
  keys: {
    p256dh: string,
    auth: string
  }
}
```
Standard Web Push subscription data (W3C PushSubscription format).

#### `messageSchema`
```
{
  id: string,
  text: string,
  sentAt: string,          // ISO 8601 timestamp
  sender: "staff" | "customer"
}
```
Bidirectional message between staff and customer. The `sender` field enables chat-thread attribution.

#### `offerSchema`
```
{
  id: string,
  title: string,
  description: string,
  createdAt: string        // ISO 8601 timestamp
}
```

#### `serviceRequestSchema`
```
{
  id: string,
  requestedAt: string,     // ISO 8601 timestamp
  acknowledgedAt: string | null  // ISO 8601 timestamp; null until staff acknowledges
}
```

#### `orderSchema`
```
{
  id: string,
  createdAt: string,
  status: OrderStatus,
  subscription: PushSubscriptionData | null,
  scheduledTime: string | null,
  notifiedAt: string | null,
  messages: Message[],
  offers: Offer[],
  serviceRequests: ServiceRequest[],
  notes?: string
}
```
The central entity. Contains all messages, offers, and service requests inline (no foreign key joins).

### Request Schemas

| Schema | Fields | Used By |
|--------|--------|---------|
| `insertOrderSchema` | `{}` (empty) | `POST /api/orders` |
| `subscribeSchema` | `{ orderId: string, subscription: PushSubscriptionData }` | `POST /api/orders/:id/subscribe` |
| `triggerNotificationSchema` | `{ orderId: string, message?: string }` | `POST /api/orders/:id/trigger` |
| `scheduleNotificationSchema` | `{ orderId: string, scheduledTime: string, message?: string }` | `POST /api/orders/:id/schedule` |

### Derived TypeScript Types

| Type | Derivation |
|------|------------|
| `OrderStatus` | `z.infer<typeof orderStatusEnum>` |
| `PushSubscriptionData` | `z.infer<typeof pushSubscriptionSchema>` |
| `Message` | `z.infer<typeof messageSchema>` |
| `Offer` | `z.infer<typeof offerSchema>` |
| `ServiceRequest` | `z.infer<typeof serviceRequestSchema>` |
| `Order` | `z.infer<typeof orderSchema>` |
| `InsertOrder` | `z.infer<typeof insertOrderSchema>` |
| `SubscribeRequest` | `z.infer<typeof subscribeSchema>` |
| `TriggerNotificationRequest` | `z.infer<typeof triggerNotificationSchema>` |
| `ScheduleNotificationRequest` | `z.infer<typeof scheduleNotificationSchema>` |

---

## 2. Storage Layer

**File:** `server/storage.ts`

### `IStorage` Interface

All methods return `Promise`-wrapped values.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getAllOrders()` | none | `Promise<Order[]>` | Returns all orders sorted by `createdAt` descending (newest first) |
| `getOrder(id)` | `id: string` | `Promise<Order \| undefined>` | Lookup by order ID |
| `createOrder()` | none | `Promise<Order>` | Creates order with generated 8-char hex ID, status `"waiting"`, all arrays empty |
| `deleteOrder(id)` | `id: string` | `Promise<boolean>` | Deletes order, returns `true` if found |
| `updateOrderSubscription(id, subscription)` | `id: string, subscription: PushSubscriptionData` | `Promise<Order \| undefined>` | Sets push subscription AND transitions status to `"subscribed"` |
| `updateOrderStatus(id, status)` | `id: string, status: Order["status"]` | `Promise<Order \| undefined>` | Sets status to any value (used by `/register` to set `"subscribed"`) |
| `updateOrderScheduledTime(id, scheduledTime)` | `id: string, scheduledTime: string` | `Promise<Order \| undefined>` | Sets scheduled time AND transitions status to `"scheduled"` |
| `markOrderNotified(id)` | `id: string` | `Promise<Order \| undefined>` | Sets status to `"notified"` AND stamps `notifiedAt` with current ISO timestamp |
| `addMessage(id, message, sender)` | `id: string, message: string, sender: "staff" \| "customer"` | `Promise<Order \| undefined>` | Appends a `Message` object with generated ID, current timestamp, and sender |
| `addOffer(id, title, description)` | `id: string, title: string, description: string` | `Promise<Order \| undefined>` | Appends an `Offer` object with generated ID and current timestamp |
| `addServiceRequest(id)` | `id: string` | `Promise<Order \| undefined>` | Appends a `ServiceRequest` object with generated ID and current timestamp |
| `updateOrderNotes(id, notes)` | `id: string, notes: string` | `Promise<Order \| undefined>` | Overwrites the `notes` string field |
| `acknowledgeServiceRequest(orderId, requestId)` | `orderId: string, requestId: string` | `Promise<Order \| undefined>` | Stamps `acknowledgedAt` on the matching service request |
| `deleteCompletedOrdersOlderThan(hours)` | `hours: number` | `Promise<number>` | Deletes completed orders older than `hours`; returns count deleted |

### `MemStorage` Class

Implements `IStorage` using an in-memory `Map<string, Order>`.

**ID Generation:** `generateShortId()` produces an 8-character hexadecimal string via `randomBytes(4).toString("hex")`. Used for order IDs and all sub-entity IDs (messages, offers, service requests).

**Status Transition Side Effects:**
- `updateOrderSubscription` always sets `status = "subscribed"`
- `updateOrderScheduledTime` always sets `status = "scheduled"`
- `markOrderNotified` always sets `status = "notified"` and `notifiedAt = new Date().toISOString()`

**Exported Singleton:** `export const storage = new MemStorage();`

**`reset()` Method (test use only):** Clears the internal `Map`, removing all orders. Called in `server/test-setup.ts` via `beforeEach` to isolate tests.

---

## 3. Server Entry Point

**File:** `server/index.ts`

### Bootstrap Sequence

1. Call `validateEnvironment()` — reads and validates all env vars; exits process on failure
2. Run `runMigrations()` — applies pending Drizzle schema migrations to PostgreSQL
3. Configure VAPID keys — calls `getVapidKeys()` in `server/routes.ts`; warns if ephemeral
4. Restore scheduled notifications — re-creates `node-schedule` jobs for orders still in `"scheduled"` state
5. Create Express app + set `trust proxy 1` (required behind Replit's reverse proxy for secure cookies)
6. Apply Helmet security headers — CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
7. Register JSON body parser with raw body capture middleware (stores `req.rawBody` on `IncomingMessage`)
8. Register URL-encoded body parser
9. Register request logging middleware — logs method, path, status, duration, IP via Winston
10. Call `registerRoutes(httpServer, app)` to set up all API routes and WebSocket servers
11. Register global error handler — returns `{ message }` JSON with status from error or 500
12. Conditional static serving:
    - **Production** (`NODE_ENV === "production"`): `serveStatic(app)` from `server/static.ts`
    - **Development**: `setupVite(httpServer, app)` from `server/vite.ts` (Vite dev middleware)
13. Bind to `PORT` (default `5000`), host `0.0.0.0`, `reusePort: true`

### Winston Logging

**File:** `server/lib/logger.ts`

- **Development format:** colorized `level [source] message {meta}` for human readability
- **Production format:** structured JSON — every log entry includes `timestamp`, `level`, `message`, and all metadata fields
- **Sensitive field sanitization:** keys matching `password`, `token`, `secret`, `auth`, `key`, `credential` are replaced with `"[REDACTED]"` before logging
- **Log levels:** controlled by `LOG_LEVEL` env var (default `info`); valid values: `debug`, `info`, `warn`, `error`

### Session Storage

PostgreSQL-backed via `connect-pg-simple`. Session store pruned every 15 minutes (`pruneSessionInterval: 900`). Sessions expire after 7 days (`maxAge: 7 * 24 * 60 * 60 * 1000`). Cookies set `httpOnly: true`, `sameSite: "strict"`, and `secure: true` in production.

---

## 4. REST API Reference

**File:** `server/routes.ts`

All endpoints are prefixed with `/api/`. Request bodies are validated with Zod schemas.

### Endpoint Summary

| Method | Path | Auth | Request Body | Success Response | Status Codes | WS Notifications |
|--------|------|------|-------------|------------------|-------------|-------------------|
| GET | `/api/health` | Public | none | `{ status, db }` | 200, 503 | none |
| POST | `/api/auth/login` | — | `{ username, password }` | `{ authenticated, username }` | 200, 400, 401, 500 | none |
| POST | `/api/auth/logout` | — | none | `{ success }` | 200 | none |
| GET | `/api/auth/me` | — | none | `{ authenticated, username? }` | 200 | none |
| GET | `/api/vapid-public-key` | Public | none | `{ publicKey: string }` | 200 | none |
| GET | `/api/orders` | Admin | none | `Order[]` | 200, 401, 500 | none |
| GET | `/api/orders/:id` | Public | none | `Order` | 200, 404, 500 | none |
| POST | `/api/orders` | Admin | none | `Order` | 201, 401, 500 | none |
| DELETE | `/api/orders/:id` | Admin | none | empty | 204, 401, 404, 500 | none |
| POST | `/api/orders/:id/register` | Public | none | `Order` | 200, 404, 500 | `notifyAdminUpdate(id, "new_registration")` |
| POST | `/api/orders/:id/subscribe` | Public | `{ subscription: PushSubscriptionData }` | `Order` | 200, 400, 404, 500 | `notifyAdminUpdate(id, "status_update")` |
| POST | `/api/orders/:id/trigger` | Admin | `{ message?: string }` | `{ success: true }` | 200, 400, 401, 500 | `notifyOrderUpdate(id, "order_ready")` + `notifyAdminUpdate(id, "order_ready")` |
| POST | `/api/orders/:id/message` | Admin | `{ message: string }` | `{ success: true }` | 200, 400, 401, 404, 500 | `notifyOrderUpdate(id, "message")` + `notifyAdminUpdate(id, "message")` |
| POST | `/api/orders/:id/customer-message` | Public | `{ message: string }` | `{ success: true }` | 200, 400, 404, 500 | `notifyOrderUpdate(id, "message")` + `notifyAdminUpdate(id, "message")` |
| POST | `/api/orders/:id/complete` | Admin | none | `Order` | 200, 400, 401, 404, 500 | `notifyOrderUpdate(id, "order_completed")` + `notifyAdminUpdate(id, "order_completed")` |
| POST | `/api/orders/:id/schedule` | Admin | `{ scheduledTime: string, message?: string }` | `Order` | 200, 400, 401, 404, 500 | `notifyOrderUpdate(id, "status_update")` + `notifyAdminUpdate(id, "status_update")` |
| POST | `/api/orders/:id/offers` | Admin | `{ title: string, description: string }` | `Order` | 200, 400, 401, 404, 500 | `notifyOrderUpdate(id, "offer")` + `notifyAdminUpdate(id, "offer")` |
| POST | `/api/orders/:id/service` | Public | none | `Order` | 200, 404, 500 | `notifyOrderUpdate(id, "service_request")` + `notifyAdminUpdate(id, "service_request")` |
| POST | `/api/orders/:id/service/:requestId/acknowledge` | Admin | none | `Order` | 200, 400, 401, 404, 500 | `notifyOrderUpdate(id, "status_update")` + `notifyAdminUpdate(id, "status_update")` |
| PATCH | `/api/orders/:id/notes` | Admin | `{ notes: string }` | `Order` | 200, 400, 401, 404, 500 | `notifyOrderUpdate(id, "status_update")` + `notifyAdminUpdate(id, "status_update")` |
| POST | `/api/orders/cleanup` | Admin | `{ maxAgeHours?: number }` | `{ deletedCount }` | 200, 400, 401, 500 | none |

### Per-Endpoint Details

**GET `/api/vapid-public-key`**
- No request body
- Response: `{ publicKey: string }` (the VAPID public key for push subscription)
- Side effects: none
- WS notifications: none

**GET `/api/orders`**
- No request body
- Response: `Order[]` sorted by `createdAt` descending
- Calls: `storage.getAllOrders()`
- WS notifications: none

**GET `/api/orders/:id`**
- No request body
- Response: `Order` on success, `{ error: "Order not found" }` on 404
- Calls: `storage.getOrder(req.params.id)`
- WS notifications: none

**POST `/api/orders`**
- No request body
- Response (201): newly created `Order` with status `"waiting"`, empty arrays, generated ID
- Calls: `storage.createOrder()`
- WS notifications: none

**DELETE `/api/orders/:id`**
- No request body
- Response (204): empty body on success, `{ error: "Order not found" }` on 404
- Side effects: cancels any `node-schedule` job in `scheduledJobs` for this order ID before deletion
- Calls: `storage.deleteOrder(req.params.id)`
- WS notifications: none

**POST `/api/orders/:id/register`**
- No request body
- Response: updated `Order` (or unchanged order if status was not `"waiting"`)
- Condition: only transitions status if current `order.status === "waiting"` (idempotent for re-visits)
- Calls: `storage.updateOrderStatus(req.params.id, "subscribed")`
- WS notifications: `notifyAdminUpdate(req.params.id, "new_registration")` (only when transition occurs)

**POST `/api/orders/:id/subscribe`**
- Request body validated with: `z.object({ subscription: pushSubscriptionSchema })`
- Response: updated `Order` with push subscription and status `"subscribed"`
- Calls: `storage.updateOrderSubscription(req.params.id, subscription)`
- WS notifications: `notifyAdminUpdate(req.params.id, "status_update")`

**POST `/api/orders/:id/trigger`**
- Request body: `{ message?: string }` (extracted from `req.body`, not Zod-validated)
- Response: `{ success: true }`
- Delegates to `sendNotification(req.params.id, message)` which:
  1. Writes message to order history via `storage.addMessage()`
  2. Marks order notified via `storage.markOrderNotified()`
  3. Fires `notifyOrderUpdate(id, "order_ready")` + `notifyAdminUpdate(id, "order_ready")`
  4. Fires 3-attempt push notifications at 0s/2s/4s (if subscription exists)

**POST `/api/orders/:id/message`**
- Request body validated with: `z.object({ message: z.string().min(1).max(200) })`
- Response: `{ success: true }`
- Sender: `"staff"`
- Calls: `storage.addMessage(req.params.id, message, "staff")`
- WS notifications: `notifyOrderUpdate(req.params.id, "message")` + `notifyAdminUpdate(req.params.id, "message")`
- Push: if subscription exists, fires 3-attempt push notifications at 0s/2s/4s (fire-and-forget)

**POST `/api/orders/:id/customer-message`**
- Request body validated with: `z.object({ message: z.string().min(1).max(200) })`
- Response: `{ success: true }`
- Sender: `"customer"`
- Calls: `storage.addMessage(req.params.id, message, "customer")`
- WS notifications: `notifyOrderUpdate(req.params.id, "message")` + `notifyAdminUpdate(req.params.id, "message")`
- Push: does NOT fire push notifications (staff uses admin dashboard WebSocket)

**POST `/api/orders/:id/schedule`**
- Request body validated with: `z.object({ scheduledTime: z.string(), message: z.string().optional() })`
- Response: updated `Order` with status `"scheduled"` and `scheduledTime` set
- Validation: returns 400 if `scheduledDate <= now`
- Side effects:
  1. Cancels any existing `node-schedule` job for this order ID
  2. Calls `storage.updateOrderScheduledTime(req.params.id, scheduledTime)` (sets status to `"scheduled"`)
  3. Creates new `node-schedule` job via `scheduleNotification(req.params.id, scheduledDate, message)`
- WS notifications: `notifyOrderUpdate(req.params.id, "status_update")` + `notifyAdminUpdate(req.params.id, "status_update")` (fired immediately so customer sees countdown without polling delay)

**POST `/api/orders/:id/offers`**
- Request body validated with: `z.object({ title: z.string().min(1), description: z.string().min(1) })`
- Response: updated `Order` with new offer appended to `offers` array
- Calls: `storage.addOffer(req.params.id, title, description)`
- WS notifications: `notifyOrderUpdate(req.params.id, "offer")` + `notifyAdminUpdate(req.params.id, "offer")`

**POST `/api/orders/:id/service`**
- No request body
- Response: updated `Order` with new service request appended to `serviceRequests` array
- Calls: `storage.addServiceRequest(req.params.id)`
- WS notifications: `notifyOrderUpdate(req.params.id, "service_request")` + `notifyAdminUpdate(req.params.id, "service_request")`

**PATCH `/api/orders/:id/notes`**
- Request body validated with: `z.object({ notes: z.string().max(500) })`
- Response: updated `Order` with `notes` field overwritten
- Calls: `storage.updateOrderNotes(req.params.id, notes)`
- WS notifications: `notifyOrderUpdate(req.params.id, "status_update")` + `notifyAdminUpdate(req.params.id, "status_update")`

---

## 5. WebSocket Protocol

**File:** `server/routes.ts`

Two independent WebSocket servers are created on the same HTTP server:

### Customer WebSocket: `/ws/orders`

**Connection URL:** `ws[s]://host/ws/orders?id=<orderId>&clientId=<clientId>&lastTimestamp=<timestamp>`

| Parameter | Required | Description |
|-----------|----------|-------------|
| `id` | Yes | Order ID to subscribe to. Connection closed if missing. |
| `clientId` | No | Session ID for reconnection tracking. Server generates one if absent. |
| `lastTimestamp` | No | Unix timestamp (ms) of last received message, for sync protocol. |

**`ExtendedWebSocket` Interface Fields:**
```
interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;           // Heartbeat liveness flag
  clientId?: string;          // Session identifier
  orderId?: string;           // Subscribed order ID
  lastMessageTimestamp?: number; // For sync protocol
}
```

**Server-Sent Message Types:**

| Type | Fields | When Sent |
|------|--------|-----------|
| `connected` | `{ type, orderId, serverTimestamp, clientId }` | Immediately on connection |
| `ping` | `{ type, timestamp }` | Every 30 seconds (heartbeat) |
| `order_updated` | `{ type, eventType, orderId }` | When any REST endpoint modifies the order |
| `sync_response` | `{ type, order, serverTimestamp }` | In response to client `sync_request` |

**Client-Sent Message Types:**

| Type | Fields | Purpose |
|------|--------|---------|
| `pong` | `{ type, timestamp }` | Heartbeat response (resets `isAlive` flag) |
| `sync_request` | `{ type, lastTimestamp }` | Request full order state after reconnect/visibility change |

**`eventType` Values in `order_updated`:**
`"message"`, `"order_ready"`, `"service_request"`, `"offer"`, `"status_update"`, `"new_registration"`, `"order_completed"`

**Connection Tracking:**
- `orderSubscribers: Map<string, Set<WebSocket>>` - Maps order IDs to connected customer WebSockets
- `clientSessions: Map<string, { orderId, lastMessageTimestamp, lastSeen }>` - Tracks sessions across reconnects

**Connection Lifecycle:**
1. On connect: Set `isAlive = true`, add to `orderSubscribers[orderId]`, send `connected` message
2. On `pong`: Reset `isAlive = true`
3. On `sync_request`: Fetch full order from storage, send as `sync_response`
4. On close: Remove from `orderSubscribers`, update `lastSeen` in `clientSessions`
5. Heartbeat interval (30s): If `isAlive === false`, terminate connection. Otherwise set `isAlive = false` and send `ping`.

### Admin WebSocket: `/ws/admin`

**Connection URL:** `ws[s]://host/ws/admin`

No query parameters required. All connected admin clients receive all order events.

**Server-Sent Message Types:**

| Type | Fields | When Sent |
|------|--------|-----------|
| `connected` | `{ type, serverTimestamp }` | Immediately on connection |
| `ping` | `{ type, timestamp }` | Every 30 seconds (heartbeat) |
| `admin_update` | `{ type, eventType, orderId }` | When any REST endpoint modifies any order |

**Connection Tracking:**
- `adminSubscribers: Set<WebSocket>` - All connected admin dashboard WebSockets

**Heartbeat:** Same 30-second interval, same `isAlive` flag mechanism as customer WebSocket.

### Heartbeat Constants

```
HEARTBEAT_INTERVAL = 30000  // 30 seconds between pings
HEARTBEAT_TIMEOUT  = 5000   // (defined but used implicitly via isAlive flag)
```

### Notification Dispatch Functions

**`notifyOrderUpdate(orderId: string, eventType: OrderEventType)`**
- Sends `{ type: "order_updated", eventType, orderId }` to all WebSockets in `orderSubscribers[orderId]`
- Only sends to connections with `readyState === 1` (OPEN)

**`notifyAdminUpdate(orderId: string, eventType: OrderEventType)`**
- Sends `{ type: "admin_update", eventType, orderId }` to all WebSockets in `adminSubscribers`
- Only sends to connections with `readyState === 1` (OPEN)

---

## 6. Push Notification Pipeline

**File:** `server/routes.ts`

### VAPID Key Management

**`function getVapidKeys(): { publicKey: string; privateKey: string }`**
1. Reads `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` from `process.env`
2. If either is missing, generates ephemeral keys via `webPush.generateVAPIDKeys()` and logs a warning with the generated keys
3. Returns `{ publicKey, privateKey }`

**VAPID Configuration:**
```
webPush.setVapidDetails(
  "mailto:admin@bistro-buzzer.app",
  vapidKeys.publicKey,
  vapidKeys.privateKey
);
```

### `async sendSinglePushNotification(orderId: string, message?: string, notificationNumber: number = 1): Promise<boolean>`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `orderId` | `string` | required | Target order |
| `message` | `string \| undefined` | `undefined` | Custom notification body |
| `notificationNumber` | `number` | `1` | Used for logging (e.g., "reminder 2/3") |

**Returns:** `Promise<boolean>` - resolves to `true` if push was sent successfully, `false` on error or no subscription.

**Behavior:**
1. Fetches order from storage
2. If no push subscription exists, returns `false` silently (push is optional)
3. Constructs payload: `{ title: "Order Ready!", body: message || "Your order is ready for pickup!", url: "/order/{orderId}" }`
4. Calls `webPush.sendNotification()` with the subscription endpoint and keys
5. Catches and logs any errors, returns `false` on failure

### `async sendNotification(orderId: string, message?: string): Promise<boolean>`

The main notification orchestrator. Called by `POST /api/orders/:id/trigger` endpoint and by scheduled jobs.

**Sequence:**
1. Fetch order from storage (throws if not found)
2. `storage.addMessage(orderId, notificationText, "staff")` - Record in message history
3. `storage.markOrderNotified(orderId)` - Set status to `"notified"`, stamp `notifiedAt`
4. `notifyOrderUpdate(orderId, "order_ready")` - Notify customer WebSocket
5. `notifyAdminUpdate(orderId, "order_ready")` - Notify admin WebSocket
6. If push subscription exists, fire 3 push attempts:
   - Attempt 1: immediate (`sendSinglePushNotification(orderId, message, 1)`)
   - Attempt 2: after 2000ms (`setTimeout`)
   - Attempt 3: after 4000ms (`setTimeout`)
   - All attempts use `.catch(() => {})` (fire-and-forget)

### `scheduleNotification(orderId: string, scheduledDate: Date, message?: string): schedule.Job | null`

Uses `node-schedule` to create a future job.

**Behavior:**
1. `schedule.scheduleJob(scheduledDate, callback)` creates the job
2. When the job fires: calls `sendNotification(orderId, message)`, then removes itself from `scheduledJobs` map
3. Stores the job reference in `scheduledJobs: Map<string, schedule.Job>`
4. Returns the `schedule.Job` instance (or `null` if scheduling failed)

### `async restoreScheduledNotifications(): Promise<void>`

Called once during server startup (inside `registerRoutes`).

**Behavior:**
1. Fetches all orders from storage
2. For each order with `status === "scheduled"` and `scheduledTime` in the future:
   - Re-schedules the notification via `scheduleNotification()`
3. Logs count of restored jobs

---

## 7. Audio Manager

**File:** `client/src/lib/audio-manager.ts`

### `AudioManager` Singleton

**Design:** Private constructor with `getInstance()` static factory method. Single global instance exported as `audioManager`.

**State:**
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `audioContext` | `AudioContext \| null` | `null` | Web Audio API context |
| `isWarmedUp` | `boolean` | `false` | Whether context has been initialized |
| `_isUnlocked` | `boolean` | `false` | Whether user gesture has activated audio |
| `volume` | `number` | `0.7` | Master volume (0.0-1.0) |
| `silentAudio` | `HTMLAudioElement \| null` | `null` | For iOS Safari audio unlock trick |
| `unlockListeners` | `Set<UnlockListener>` | empty | Callbacks notified when unlock state changes |

**localStorage Key:** `AUDIO_UNLOCK_KEY = 'audio_manager_unlocked'` - Persists unlock consent across page loads.

### Unlock Lifecycle

1. **Construction:** If `localStorage` has `audio_manager_unlocked === 'true'`, calls `tryRestoreUnlock()`
2. **`tryRestoreUnlock()`:** Creates AudioContext. If state is `'running'`, sets unlocked. If `'suspended'`, registers `onstatechange` listener.
3. **`unlock()`:** (Called on user gesture)
   - Creates/resumes AudioContext
   - Plays silent oscillator (0 gain, 0.1s duration) to prime the context
   - Creates silent `HTMLAudioElement` with base64 WAV data, plays and pauses it (iOS Safari trick)
   - Sets `_isUnlocked = true`, stores to localStorage, notifies listeners
   - Returns `boolean` success

### `createOscillator()` Helper

```
createOscillator(ctx, type, frequency, startTime, duration, gainEnvelope)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `ctx` | `AudioContext` | Audio context |
| `type` | `OscillatorType` | `'sine'`, `'triangle'`, `'sawtooth'`, `'square'` |
| `frequency` | `number` | Frequency in Hz |
| `startTime` | `number` | Start time in context time |
| `duration` | `number` | Total duration in seconds |
| `gainEnvelope` | `{ attack, sustain, release, peak }` | ADSR-like envelope (all in seconds except peak: 0-1) |

Gain is scaled by `this.volume` (master volume).

### Sound Cues (7 Total)

| Cue | Duration | Waveform | Frequencies | Role | Description |
|-----|----------|----------|-------------|------|-------------|
| `order-ready` | 1.5s | sine | 880Hz + 659.25Hz, repeated at +0.7s | Customer | Double two-tone chime for pickup alert |
| `message` | 0.6s | sine | 523.25Hz, 659.25Hz, 783.99Hz (ascending, 0.15s spacing) | Customer | Three-note ascending chime |
| `offer` | 0.8s | triangle | 392, 493.88, 587.33, 783.99, 880Hz (ascending, 0.1s spacing) | Customer | Five-note celebratory arpeggio |
| `status-update` | 0.4s | sine | 1200Hz | Customer | Single quick ping |
| `service-request` | 1.0s | triangle | 880, 698.46, 523.25Hz (descending), repeated at +0.5s | Staff | Double descending staccato |
| `new-registration` | 0.5s | sine | 392, 493.88, 587.33Hz (ascending, 0.1s spacing) | Staff | Three-note welcome chime |
| `order-completed` | 0.5s | sine | 349.23Hz then 523.25Hz at +0.2s | Staff | Two-note resolution cadence |

### Public Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `play(cue)` | `(cue: SoundCue) => boolean` | Plays sound regardless of unlock state. Returns `false` if context unavailable. |
| `playIfUnlocked(cue)` | `(cue: SoundCue) => boolean` | Only plays if `_isUnlocked === true` |
| `playWithDelay(cue, delayMs)` | `(cue: SoundCue, delayMs: number) => void` | Calls `play()` after `setTimeout` |
| `warmUp()` | `() => void` | Initializes AudioContext without user gesture (may stay suspended) |
| `unlock()` | `() => Promise<boolean>` | Full unlock with user gesture |
| `setVolume(level)` | `(level: number) => void` | Clamps to 0.0-1.0 range |
| `getVolume()` | `() => number` | Returns current volume |
| `getContext()` | `() => AudioContext \| null` | Creates/resumes context, returns it |
| `onUnlockChange(listener)` | `(listener: UnlockListener) => () => void` | Subscribe to unlock state changes. Returns unsubscribe function. |

### `useAudioManager()` Hook

Returns an object wrapping `audioManager` singleton methods:
`{ warmUp, unlock, isUnlocked, play, playIfUnlocked, setVolume, getVolume }`

---

## 8. Device Capabilities

**File:** `client/src/lib/device-capabilities.ts`

### Type Definitions

```
type DeviceType = 'ios-safari' | 'android-chrome' | 'desktop-chrome'
                | 'desktop-firefox' | 'desktop-other' | 'mobile-other';
```

### `DeviceCapabilities` Interface

| Field | Type | Description |
|-------|------|-------------|
| `deviceType` | `DeviceType` | Detected platform |
| `webAudio` | `boolean` | `AudioContext` or `webkitAudioContext` available |
| `pushNotifications` | `boolean` | `PushManager` in window AND not iOS |
| `serviceWorker` | `boolean` | `'serviceWorker' in navigator` |
| `notifications` | `boolean` | `'Notification' in window` |
| `vibration` | `boolean` | `'vibrate' in navigator` |
| `screenWakeLock` | `boolean` | `'wakeLock' in navigator` |
| `reducedMotion` | `boolean` | `prefers-reduced-motion: reduce` media query |
| `isIOS` | `boolean` | Derived from `deviceType` |
| `isAndroid` | `boolean` | Derived from `deviceType` |
| `isMobile` | `boolean` | `isIOS \|\| isAndroid \|\| deviceType === 'mobile-other'` |
| `isDesktop` | `boolean` | `!isMobile` |

### `detectDeviceType()` Logic

UA string parsing with priority order:
1. iOS check: `/iphone|ipad|ipod/` OR (platform `macos` with `maxTouchPoints > 1`) OR (platform `mac` with `ontouchend`)
2. Android: `/android/`
3. Chrome: `/chrome/` excluding `/edge|edg/`
4. Firefox: `/firefox/`
5. Safari: `/safari/` excluding `/chrome/`
6. Mobile: any iOS/Android OR `/mobile/`

Decision tree: `isIOS && isSafari` -> `'ios-safari'`, `isAndroid && isChrome` -> `'android-chrome'`, etc.

### `detectCapabilities()`

Calls all feature detection functions. Note: `pushNotifications` is forced `false` on iOS (Web Push not reliably supported on iOS Safari for PWAs in this context).

### `NotificationStrategy` Interface

| Field | Type | Description |
|-------|------|-------------|
| `primary` | `'websocket' \| 'push'` | Primary notification channel |
| `audio` | `boolean` | Play sound cues |
| `vibration` | `boolean` | Use haptic feedback |
| `visualBadge` | `boolean` | Update tab badge count |
| `inAppBanner` | `boolean` | Show in-app notification banners |
| `wakeLock` | `boolean` | Acquire screen wake lock |

### `getNotificationStrategy()` Per-Device Matrix

| Device | Primary | Audio | Vibration | Badge | Banner | WakeLock |
|--------|---------|-------|-----------|-------|--------|----------|
| `ios-safari` | `websocket` | if webAudio | `false` | `true` | `true` | if supported |
| `android-chrome` | `push` (if available) | if webAudio | if supported | `true` | `true` | if supported |
| `desktop-chrome` / `desktop-firefox` | `push` (if available) | if webAudio | `false` | `true` | `true` | `false` |
| default | `websocket` | if webAudio | if supported | `true` | `true` | `false` |

### `useDeviceCapabilities()` Hook

Returns:
```
{
  capabilities: DeviceCapabilities,
  strategy: NotificationStrategy,
  canVibrate: () => boolean,
  vibrate: (pattern: number | number[]) => boolean
}
```

`vibrate()` wraps `navigator.vibrate()` with try/catch and capability check.

---

## 9. Notification Orchestrator

**File:** `client/src/lib/notification-orchestrator.ts`

### `NotificationOrchestrator` Singleton

Central dispatcher that routes WebSocket events to audio, vibration, badge, and callback channels.

**State:**
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `capabilities` | `DeviceCapabilities` | auto-detected | Device feature flags |
| `strategy` | `NotificationStrategy` | derived from capabilities | Channel availability |
| `role` | `NotificationRole` | `'customer'` | Determines which sound cues play |
| `isWarmedUp` | `boolean` | `false` | Whether `warmUp()` has been called |
| `lastNotificationTime` | `Record<string, number>` | `{}` | Per-event-type throttle timestamps |
| `throttleMs` | `number` | `500` | Minimum interval between same-type notifications |
| `unseenNotifications` | `NotificationEvent[]` | `[]` | Accumulator for badge count |
| `onNotificationCallbacks` | callback array | `[]` | External observers |

### Event Type Mapping

**`eventToSoundCue` - Maps event types to role-specific sound cues:**

| Event Type | Customer Sound | Staff Sound |
|------------|---------------|-------------|
| `order_ready` | `'order-ready'` | - |
| `message` | `'message'` | - |
| `offer` | `'offer'` | - |
| `service_request` | - | `'service-request'` |
| `status_update` | `'status-update'` | - |
| `new_registration` | - | `'new-registration'` |
| `order_completed` | - | `'order-completed'` |

### Vibration Patterns

| Event Type | Pattern (ms) | Intensity |
|------------|-------------|-----------|
| `order_ready` | `[100, 50, 100, 50, 200]` | strong |
| `message` | `[50, 30, 50]` | light |
| `offer` | `[30, 20, 30, 20, 30, 20, 80]` | medium |
| `service_request` | `[150, 100, 150]` | strong |
| `status_update` | `[30]` | light |
| `new_registration` | `[50, 30, 80]` | medium |
| `order_completed` | `[80, 50, 120]` | medium |

### `notify(event)` Dispatch Chain

1. **Throttle check:** If same `event.type` was dispatched within last 500ms, drop silently
2. **Play sound:** Look up `eventToSoundCue[event.type]` for current `role`, call `audioManager.play(cue)`
3. **Trigger vibration:** Call `navigator.vibrate(pattern)` if strategy allows
4. **Update badge:** Push to `unseenNotifications`, update tab badge count
5. **Fire callbacks:** Invoke all registered `onNotification` callbacks

### Tab Badge

`updateTabBadge(count)`:
- Calls `navigator.setAppBadge(count)` (if supported, PWA badge API)
- Updates `document.title` to `"(N) Restaurant Buzzer"` or `"Restaurant Buzzer"` when count is 0

### Wake Lock

`requestWakeLock()`: Calls `navigator.wakeLock.request('screen')` if strategy and capabilities allow. Returns `WakeLockSentinel | null`.

### `useNotificationOrchestrator()` Hook

Returns wrapped methods:
```
{ orchestrator, warmUp, notify, setRole, getRole, clearUnseen,
  getUnseenCount, onNotification, getCapabilities, getStrategy,
  requestWakeLock, getDeviceInfo, getCapabilitySummary }
```

---

## 10. WebSocket Manager (Client)

**File:** `client/src/lib/websocket-manager.ts`

### `WebSocketManager` Class

Robust client-side WebSocket wrapper with reconnection, sync protocol, message queuing, and page visibility handling.

**Constructor Config:**
```
interface WebSocketManagerConfig {
  url: string;              // Not used directly (URL is constructed internally)
  orderId: string;          // Order to subscribe to
  onMessage: MessageHandler;
  onConnect?: ConnectionHandler;
  onDisconnect?: ConnectionHandler;
  onReconnecting?: (attempt: number) => void;
}
```

**Constants:**
| Constant | Value | Purpose |
|----------|-------|---------|
| `STORAGE_KEY_PREFIX` | `'ws_client_'` | localStorage key prefix for session data |
| `MAX_RECONNECT_ATTEMPTS` | `10` | Give up after this many failures |
| `INITIAL_BACKOFF_MS` | `1000` | First retry delay (1 second) |
| `MAX_BACKOFF_MS` | `30000` | Maximum retry delay (30 seconds) |

**Internal State:**
| Field | Type | Purpose |
|-------|------|---------|
| `ws` | `WebSocket \| null` | Current WebSocket connection |
| `clientId` | `string` | Session ID (persisted in localStorage) |
| `lastMessageTimestamp` | `number` | Unix ms of last received message |
| `messageQueue` | `QueuedMessage[]` | Messages queued while disconnected |
| `reconnectAttempts` | `number` | Current retry counter |
| `reconnectTimeout` | timer | Pending reconnect timer |
| `isConnecting` | `boolean` | Prevents duplicate connect attempts |
| `isManualClose` | `boolean` | Suppresses auto-reconnect on intentional close |
| `visibilityHandler` | function | Reference to Page Visibility API listener |

### Connection URL Construction

```
{ws|wss}://{host}/ws/orders?id={orderId}&clientId={clientId}&lastTimestamp={timestamp}
```
Protocol is `wss:` if page is served over HTTPS, `ws:` otherwise.

### Client ID Management

- On first connection: generates `client_{timestamp}_{random9chars}` ID, stores in `localStorage`
- Key: `ws_client_{orderId}_clientId`
- On reconnect: reuses stored ID for server-side session continuity

### Timestamp Tracking

- Key: `ws_client_{orderId}_timestamp`
- Updated on: `connected` message, `sync_response` message, `order_updated` message
- Sent to server on connect (as `lastTimestamp` query param) and in `sync_request`

### Exponential Backoff Reconnection

```
delay = min(1000 * 2^attempt, 30000)
```
Sequence: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s (then stop after 10 attempts).

### Page Visibility API

- Listens to `document.visibilitychange`
- On `visible`:
  - If connection is not OPEN: calls `reconnect()` (resets attempts, connects fresh)
  - If connection is OPEN: calls `requestSync()` to catch missed updates

### Message Handling

Internal message routing:
1. `ping` -> respond with `pong`
2. `connected` -> update `clientId` if server assigned a new one, store timestamp
3. `sync_response` -> store timestamp, forward to `onMessage`
4. `order_updated` -> store timestamp, forward to `onMessage`
5. All other types -> forward to `onMessage`

### Message Queue

Messages sent via `send()` while disconnected are queued. On reconnect (`onopen`), `flushMessageQueue()` replays all queued messages.

### Public Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `send(data)` | `boolean` | Send JSON message. Returns `false` and queues if not connected. |
| `getConnectionState()` | `string` | `'connecting'`, `'connected'`, `'disconnected'`, or `'reconnecting'` |
| `getClientId()` | `string` | Current session ID |
| `close()` | `void` | Manual close. Sets `isManualClose`, clears timers, removes visibility listener, closes socket. |

### Factory Function

```
createWebSocketManager(config: WebSocketManagerConfig): WebSocketManager
```

---

## 11. IndexedDB Offline Storage

**File:** `client/src/lib/indexed-db-storage.ts`

### Database Schema

| Constant | Value |
|----------|-------|
| `DB_NAME` | `'restaurant_buzzer_db'` |
| `DB_VERSION` | `1` |

**Object Stores:**

| Store | Key Path | Indexes | Purpose |
|-------|----------|---------|---------|
| `orders` | `id` | none | Cached order objects |
| `messages` | `id` | `orderId` (non-unique) | Cached messages with order association |
| `metadata` | `key` | none | Key-value metadata (e.g., `lastWrite` timestamp) |

### `openDatabase()` - Singleton Pattern

- Maintains `dbInstance` (resolved DB) and `dbInitPromise` (pending open)
- Returns cached instance on subsequent calls
- Handles `onupgradeneeded` to create all 3 stores
- Resets `dbInitPromise` on error so retries are possible

### Data Eviction Detection

`checkDataEviction()`:
- Reads `lastWrite` from metadata store
- If no entry exists or timestamp is older than 7 days, returns `true` (data may have been evicted by browser)
- Returns `false` if data was written within the last 7 days

### Exported Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `isIndexedDBAvailable()` | `() => Promise<boolean>` | Checks `'indexedDB' in window` and attempts to open |
| `saveOrder(order)` | `(order: Order) => Promise<void>` | Put order into `orders` store, update `lastWrite` |
| `getOrder(orderId)` | `(orderId: string) => Promise<Order \| null>` | Get from `orders` store by ID |
| `deleteOrder(orderId)` | `(orderId: string) => Promise<void>` | Delete order and all associated messages (via `orderId` index cursor) |
| `saveMessage(orderId, message)` | `(orderId: string, message: Message) => Promise<void>` | Put message with `orderId` field into `messages` store |
| `getMessages(orderId)` | `(orderId: string) => Promise<Message[]>` | Get all messages for order via `orderId` index |
| `clearAllData()` | `() => Promise<void>` | Clear all 3 object stores |

### `offlineStorage` Facade

Convenience object re-exporting all functions under short names:
```
{
  isAvailable: isIndexedDBAvailable,
  checkEviction: checkDataEviction,
  saveOrder, getOrder, deleteOrder,
  saveMessage, getMessages,
  clearAll: clearAllData
}
```

---

## 12. Service Worker

**File:** `client/public/sw.js`

### Cache Configuration

| Constant | Value |
|----------|-------|
| `CACHE_NAME` | `'restaurant-buzzer-v3'` |
| `STATIC_ASSETS` | `['/', '/favicon.png', '/manifest.json']` |

### Lifecycle Events

**`install`:**
1. Opens cache by name
2. Caches all static assets (with `.catch()` for individual failures)
3. Calls `self.skipWaiting()` to activate immediately

**`activate`:**
1. Calls `clients.claim()` to take control of all open tabs
2. Deletes all caches that don't match current `CACHE_NAME` (old version cleanup)

### Fetch Strategy

**Cache-first with network update:**
1. Check cache for match
2. Simultaneously fetch from network
3. If network response is OK (status 200, type `basic`): clone and update cache
4. Return cached version immediately if available, otherwise wait for network
5. If network fails: return cached version as fallback

**Bypass:** Requests to `/api/` and `/ws/` paths are not intercepted (passthrough to server).

**Method filter:** Only `GET` requests are intercepted.

### Push Event Handler

On `push` event:
1. Parse payload as JSON (fallback: use raw text as body)
2. Default: `{ title: "Order Ready!", body: "Your order is ready for pickup!" }`
3. Show notification with options:
   - `vibrate: [200, 100, 200, 100, 200]`
   - `tag: "order-notification"` (deduplicates by tag)
   - `renotify: true` (re-alerts even if same tag exists)
   - `requireInteraction: true` (stays visible until dismissed)
   - `silent: false`
4. Post `{ type: "ORDER_READY", data }` message to all controlled window clients

### Notification Click Handler

1. Close the notification
2. Search for an existing window client with matching URL
3. If found: call `client.focus()`
4. If not found: call `clients.openWindow(url)`

### Message Handler

Handles `{ type: "SKIP_WAITING" }` message by calling `self.skipWaiting()`.

---

## 13. Frontend Pages

### App Shell

**File:** `client/src/App.tsx`

**Routing (Wouter):**
| Path | Component | Description |
|------|-----------|-------------|
| `/` | `AdminPage` | Admin dashboard (default) |
| `/admin` | `AdminPage` | Admin dashboard (alias) |
| `/order/:id` | `CustomerPage` | Customer order status page |
| `*` | `NotFound` | 404 fallback |

**Providers:**
- `QueryClientProvider` with configured `queryClient`
- `TooltipProvider` (Shadcn)
- `Toaster` for toast notifications
- `IOSInstallPrompt` component for PWA install guidance on iOS

### Admin Dashboard

**File:** `client/src/pages/admin.tsx`

**Data Fetching:**
- `useQuery({ queryKey: ['/api/orders'], refetchInterval: 2000 })` - Polls every 2 seconds as safety fallback

**WebSocket Connection (inline implementation):**
- Uses a raw `WebSocket` created inside a `useEffect` hook
- URL: `{ws|wss}://{host}/ws/admin`
- On `ping`: responds with `{ type: "pong", timestamp }`
- On `connected`: logs acknowledgment
- On `admin_update`: calls `playStaffSound(eventType)`, triggers `navigator.vibrate([200, 100, 200])`, invalidates `["/api/orders"]` query cache
- Exponential backoff reconnect: `min(1000 * 2^attempts, 30000)`, max 10 attempts
- Page Visibility API: on `visible`, if connection is not OPEN, resets attempts and reconnects

**Audio System:**
- `audioEnabled` state + `audioEnabledRef`: set to `true` on first user interaction via document-level event listeners (`touchstart`, `click`, `scroll`, `keydown`)
- `enableAudio()` calls `audioManager.warmUp()` and sets the ref/state
- `playStaffSound(type)` guards on both `audioEnabledRef.current` and `isAdminMutedRef.current` before playing:
  - `'service_request'` -> `audioManager.play('service-request')`
  - `'new_registration'` -> `audioManager.play('new-registration')`
  - `'order_completed'` -> `audioManager.play('order-completed')`
  - `'message'` -> `audioManager.play('message')`

**Toast Notifications (per event type):**
- `'service_request'` -> destructive toast: "Service Request — Order {orderId} needs assistance"
- `'new_registration'` -> toast: "New Customer — Order {orderId} customer arrived"
- `'message'` -> toast: "Customer Message — Order {orderId truncated to 8 chars, uppercased} sent a message"

**Mute State:**
- `isAdminMuted` state + `isAdminMutedRef` persisted in `localStorage` key `"admin_muted"`
- When muted: `playStaffSound()` returns early (audio skipped, toasts still fire)
- Toggle button in header: `VolumeX` icon with muted-foreground (muted) / `Volume2` icon green (unmuted)

**Order Cards:**
- Display order ID, status badge, creation time, notes
- Show last 5 messages (reversed, newest first) with sender badges: `"Customer"` uses `variant="default"`, `"You"` uses `variant="secondary"`
- Service requests highlighted in red
- Action buttons: QR Code, Notify Now, Schedule, Send Message, Notes, Offers, Delete

**Modals:**
- **Notification Modal:** Custom message input + "Send Notification" button. Enter key submits.
- **Message Modal:** Custom message input (1-200 chars) + "Send Message" button. Enter key submits.
- **Schedule Modal:** DateTime picker + optional message + "Schedule" button
- **Offer Modal:** Title + description inputs + "Add Offer" button
- **Notes Modal:** Textarea (max 500 chars) + "Save Notes" button

### Customer Order Page

**File:** `client/src/pages/customer.tsx`

**Data Fetching:**
- `useQuery<Order>({ queryKey: ["/api/orders", orderId], refetchInterval: 2000, initialData: cachedOrder })` - Polls every 2 seconds as fallback
- `cachedOrder` is loaded from IndexedDB on mount via `offlineStorage.getOrder(orderId)` for instant display before network response
- Successful fetches are persisted back to IndexedDB via `offlineStorage.saveOrder(order)`

**Auto-Registration:**
- On mount (via `useEffect`): if `order.status === "waiting"` and not yet registered, calls `registerMutation.mutate()` which sends `POST /api/orders/:id/register`
- Only transitions from `"waiting"` to `"subscribed"`

**Push Subscription Flow (`subscribeToPushSilent` callback):**
- Fetches VAPID public key from `GET /api/vapid-public-key`
- Waits for `navigator.serviceWorker.ready`
- Calls `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with the VAPID key converted via `urlBase64ToUint8Array()`
- Logs the push service host for debugging (FCM on Android, APNs on Apple, etc.)
- Sends subscription to `POST /api/orders/${orderId}/subscribe`

**Auto-Enable on First Interaction (`autoEnable` callback):**
- Triggered by document-level event listeners for `touchstart`, `click`, `pointerdown`, `mousedown`, `keydown` (registered with `{ once: true, passive: true }`)
- Calls `audioManager.unlock()` and plays a short buzzer confirmation via `playBuzzer()` if not muted
- If `Notification` and `serviceWorker` APIs available: requests `Notification.requestPermission()`, if granted calls `subscribeToPushSilent()`

**WebSocket Connection (inline implementation, NOT using `WebSocketManager`):**
- Uses a raw `WebSocket` created inside a `useEffect` hook
- URL: `{ws|wss}://{host}/ws/orders?id={orderId}` (no clientId or lastTimestamp params)
- On `ping`: responds with `{ type: "pong", timestamp }` 
- On `order_updated` with `eventType === "order_ready"`: calls `playBuzzer()` (800Hz square wave, 0.8s duration) if not muted, invalidates query
- On `order_updated` with `eventType === "message"`: calls `playMessageChime()` (`audioManager.playIfUnlocked("message")`) if not muted, invalidates query
- Exponential backoff reconnect: `min(1000 * 2^attempts, 30000)`, max 10 attempts
- Page Visibility API: on `visible`, if connection is not OPEN, resets attempts and reconnects

**Service Worker Message Listener:**
- Listens for `{ type: "ORDER_READY" }` messages from the service worker (posted during push events)
- On receipt: calls `playBuzzer()` and invalidates query

**`playBuzzer()` callback:**
- Custom 800Hz square wave buzzer (not using `audioManager.play('order-ready')`)
- Creates oscillator at 800Hz, gain 0.3, exponential ramp to 0.01 over 0.8s
- Respects `isMuted` state (returns early if muted)

**`playMessageChime()` callback:**
- Calls `audioManager.playIfUnlocked("message")`
- Respects `isMuted` state (returns early if muted)

**`MessageThread` Component:**
- Displays full `order.messages` array in a scrollable container (`max-h-52 overflow-y-auto`)
- Customer messages (`sender === "customer"`): right-aligned, `bg-primary text-primary-foreground`
- Staff messages (`sender === "staff"`): left-aligned, `bg-muted text-foreground`
- Each bubble shows message text + sender label ("You" or "Staff") + relative time via `formatRelativeTime()` (e.g., "2m ago", "just now")
- Auto-scrolls to bottom on new messages via `useRef` and `scrollIntoView({ behavior: "smooth" })`
- Input (max 200 chars) + send button anchored at bottom
- Enter key submits via `onKeyDown`
- Sends via `POST /api/orders/${orderId}/customer-message` using `sendMessageMutation`

**`StatusCard` Component:**
- Displays order status with icon, title, and description based on `getStatusConfig(status)`:
  - `"waiting"` / `"subscribed"`: Clock icon, "Order Registered", "We're preparing your order. You'll be alerted when it's ready!"
  - `"scheduled"`: Calendar icon, "Order In Progress", "Your order is being prepared. You'll be alerted soon!" + live countdown timer updated every 1 second showing remaining time
  - `"notified"` / `"completed"`: CheckCircle2 icon, "Order Ready!", "Your order is ready for pickup"
- Includes "Call Waiter" button (destructive variant) that calls `POST /api/orders/:id/service`

**Mute Toggle:**
- `isMuted` state persisted in `localStorage` key `"customer_muted"`
- Toggle button in status bar: `Volume2` icon with "Sound On" (unmuted) / `VolumeX` icon with "Muted" (muted)
- When muted: `playBuzzer()` and `playMessageChime()` return early without playing audio
- Mute is separate from audio unlock — AudioContext stays warm when muted

**Status Bar:**
- Shows push notification status: Bell icon green "Push On" or grey "Push Off"
- Shows audio status: Volume2 icon green "Audio Ready" or VolumeX icon amber "Tap to Enable"
- Shows mute toggle button on the right side

**Notification Setup Prompt:**
- Visible when `isSetupComplete` is false (i.e., push not enabled OR audio not unlocked)
- Card with Bell icon, "Enable Notifications" text, and button that calls `autoEnable()`

---

## 14. Configuration and Environment

### Environment Variables

Validated at startup by `server/env-validation.ts`. Server exits with a descriptive error if a required variable is missing.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string. Process exits on startup if absent. |
| `SESSION_SECRET` | Recommended | Random 32-byte hex (ephemeral) | Signs `express-session` cookies. Without it, all sessions are invalidated on restart. |
| `VAPID_PUBLIC_KEY` | Recommended | Ephemeral (generated) | Web Push VAPID public key. Changing this invalidates all existing push subscriptions. |
| `VAPID_PRIVATE_KEY` | Recommended | Ephemeral (generated) | Paired with `VAPID_PUBLIC_KEY`. Must be set together. |
| `ALLOWED_ORIGIN` | Optional | `*.replit.app,*.repl.co` | Comma-separated allowed origins for CORS and CSP `connect-src`. |
| `NODE_ENV` | Optional | Unset | `development` or `production`. Controls cookie security and log format. |
| `PORT` | Optional | `5000` | HTTP server port. |
| `LOG_LEVEL` | Optional | `info` | Winston log level: `debug`, `info`, `warn`, or `error`. |

### Vite Configuration

- Alias `@shared` points to `shared/` directory for cross-boundary imports
- Development: Vite dev middleware handles HMR and asset serving (via `server/vite.ts`)
- Production: Static files served from build output (via `server/static.ts`)

### TanStack Query Defaults

**File:** `client/src/lib/queryClient.ts`

```
{
  queries: {
    queryFn: getQueryFn({ on401: "throw" }),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: false
  },
  mutations: {
    retry: false
  }
}
```

- `staleTime: Infinity` means data is never considered stale (explicit invalidation required)
- `refetchOnWindowFocus: false` prevents duplicate fetches on tab switch
- Individual queries override `refetchInterval` to `2000` for safety-net polling
- `getQueryFn` constructs URL from `queryKey.join("/")` and returns parsed JSON

### `apiRequest()` Utility

```
apiRequest(method: string, url: string, data?: unknown): Promise<Response>
```
- Sets `Content-Type: application/json` if body provided
- Includes credentials (`credentials: "include"`)
- Throws on non-OK status with `"STATUS: BODY"` message format

### PWA Manifest

**File:** `client/public/manifest.json`

- `display: "standalone"` for native-like PWA experience
- Apple-specific meta tags in HTML for iOS PWA support
- Service worker registered on page load for offline caching

### Service Worker Cache Version

`CACHE_NAME = 'restaurant-buzzer-v3'` - Must be manually bumped on each deploy to invalidate old caches.

---

## 15. Order Lifecycle and Status Flow

### State Machine

**File:** `server/lib/state-machine.ts`

```
waiting  -->  subscribed  -->  scheduled  -->  notified  -->  completed
   |              |                               ^
   |              +-------------------------------+
   |              (direct notify without scheduling)
   |
   +---------------------------------------------------->  notified
   (waiting → notified: direct notify on unclaimed order)
```

**`VALID_TRANSITIONS` map:**
```typescript
{
  waiting:    ["subscribed", "notified"],
  subscribed: ["scheduled", "notified"],
  scheduled:  ["notified"],
  notified:   ["completed"],
  completed:  []
}
```

**`isValidTransition(from, to): boolean`** — pure function, no side effects.

**`assertValidTransition(from, to): void`** — throws `ValidationError` if the transition is invalid.

**`ValidationError`** extends `Error` with `status: 400`. The message format is:
```
Invalid transition: {from} → {to}. Allowed: {allowedStates.join(", ")}
```

Route handlers catch `ValidationError` and return `{ error: message }` with HTTP 400. This prevents the state machine from being bypassed via direct API calls.

### Transition Table

| From | To | Triggered By | Endpoint | WS Events |
|------|----|-------------|----------|-----------|
| `waiting` | `subscribed` | Customer visits order page | `POST /api/orders/:id/register` | `notifyAdminUpdate("new_registration")` |
| `waiting`/`subscribed` | `subscribed` | Customer enables push | `POST /api/orders/:id/subscribe` | `notifyAdminUpdate("status_update")` |
| `subscribed` | `scheduled` | Staff schedules notification | `POST /api/orders/:id/schedule` | `notifyOrderUpdate("status_update")` + `notifyAdminUpdate("status_update")` |
| `waiting`/`subscribed`/`scheduled` | `notified` | Staff triggers notification or scheduled job fires | `POST /api/orders/:id/trigger` / scheduled job | `notifyOrderUpdate("order_ready")` + `notifyAdminUpdate("order_ready")` |
| `notified` | `completed` | Staff marks order complete | `POST /api/orders/:id/complete` | `notifyOrderUpdate("order_completed")` + `notifyAdminUpdate("order_completed")` |

### Customer UI Per Status

Source: `getStatusConfig()` in `client/src/pages/customer.tsx`

| Status | `title` | `description` | Icon | Color |
|--------|---------|---------------|------|-------|
| `waiting` | "Order Registered" | "We're preparing your order. You'll be alerted when it's ready!" | `Clock` | `text-primary` |
| `subscribed` | "Order Registered" | "We're preparing your order. You'll be alerted when it's ready!" | `Clock` | `text-primary` |
| `scheduled` | "Order In Progress" | "Your order is being prepared. You'll be alerted soon!" + countdown timer | `Calendar` | `text-primary` |
| `notified` | "Order Ready!" | "Your order is ready for pickup" | `CheckCircle2` | `text-green-600 dark:text-green-500` |
| `completed` | "Order Ready!" | "Your order is ready for pickup" | `CheckCircle2` | `text-green-600 dark:text-green-500` |

Note: `waiting` and `subscribed` share the same config. `notified` and `completed` share the same config. The `isReady` flag (`order.status === "notified" || order.status === "completed"`) controls the green background circle styling.

### Side Effects Per Transition

**`waiting` -> `subscribed` (via `POST /api/orders/:id/register`):**
- Storage: `updateOrderStatus(id, "subscribed")`
- WS: Admin notified of new registration
- Audio: Staff hears `new-registration` chime (if admin page open)

**`subscribed` -> `scheduled` (via `POST /api/orders/:id/schedule`):**
- Storage: `updateOrderScheduledTime(id, scheduledTime)` sets status + time
- Scheduling: `node-schedule` job created
- WS: Both customer and admin notified immediately
- Customer: Sees countdown timer

**any -> `notified` (via `POST /api/orders/:id/trigger` or scheduled job):**
- Storage: `addMessage()` records notification text, `markOrderNotified()` sets status + timestamp
- WS: Both customer and admin notified
- Push: 3 push notifications at 0s, 2s, 4s (if subscription exists)
- Audio: Customer hears `order-ready` buzzer
- Vibration: Customer device vibrates (if supported)

---

## 16. Known Optimization Opportunities

Items marked ✅ have been completed. Remaining items represent potential future work.

### ✅ Data Persistence — PostgreSQL Migration
**Completed.** `admin_users` and `user_sessions` tables are now stored in PostgreSQL via Drizzle ORM + Neon serverless. Orders are still stored in `MemStorage` (in-memory) for demo purposes — see TRACKING.md for the migration path.

### ✅ Admin Authentication
**Completed.** Session-based authentication via `express-session` + `connect-pg-simple`. `requireAuth` middleware protects all admin endpoints. Passwords hashed with bcrypt cost factor 12. Login: `POST /api/auth/login`.

### ✅ Input Sanitization
**Completed.** All user-supplied text (messages, notes, offer title/description) passes through `server/lib/sanitize.ts` before storage.

### ✅ Structured Logging
**Completed.** `server/lib/logger.ts` provides Winston-based logging with JSON output in production, colorized output in dev, sensitive-field redaction, and configurable log level via `LOG_LEVEL` env var.

### ✅ Env Var Validation
**Completed.** `server/env-validation.ts` validates all required and optional env vars at startup; process exits with a descriptive error on failure.

### ✅ Security Headers
**Completed.** Helmet middleware applied at server startup with strict CSP, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`.

### ✅ Order State Machine
**Completed.** `server/lib/state-machine.ts` enforces valid transitions. `assertValidTransition()` throws `ValidationError` (HTTP 400) on invalid transitions. All mutating route handlers call `assertValidTransition` before modifying state.

### ✅ Service Request Acknowledgment
**Completed.** `POST /api/orders/:id/service/:requestId/acknowledge` stamps `acknowledgedAt` on the request. Customer UI shows "Staff notified" status in real time.

### ✅ Auto-Cleanup
**Completed.** Hourly interval deletes completed orders older than 24 hours. Manual trigger available via `POST /api/orders/cleanup`.

### ✅ Session Table Pruning
**Completed.** `connect-pg-simple` prunes expired sessions every 15 minutes (`pruneSessionInterval: 900`).

### ✅ Vitest Test Suite
**Completed.** 40 tests across 4 suites covering state machine, auth, orders, and messages. Run with `npx vitest run`.

---

### Push Notification Retry — No Confirmed Delivery
**Issue:** 3 push notifications are sent at 0s, 2s, 4s via fire-and-forget `setTimeout`. No delivery confirmation.
**Impact:** May produce duplicate notifications if earlier attempts succeed. Deduplication relies solely on SW `tag: "order-notification"`.
**Suggestion:** Track push attempt success and skip subsequent attempts on confirmed delivery.

### Polling Fallback Frequency
**Issue:** Both `admin.tsx` and `customer.tsx` poll via `refetchInterval: 2000` as a WebSocket safety net.
**Impact:** ~30 requests/minute per client even when WebSocket is healthy.
**Suggestion:** Increase to 10–15 seconds, or disable when WebSocket is confirmed connected.

### Rate Limiting
**Issue:** No rate limiting is implemented on any endpoint.
**Impact:** High-frequency endpoints (`/service`, `/customer-message`) could be abused.
**Suggestion:** Add `express-rate-limit` in front of public-facing write endpoints.

### `clientSessions` Map Unbounded Growth
**Issue:** The `clientSessions` Map stores session data for every client that has ever connected.
**Impact:** Memory leak proportional to total unique clients.
**Suggestion:** Evict entries with `lastSeen` older than 1 hour via a cleanup interval.

### Service Worker Cache Version
**Issue:** `CACHE_NAME = 'restaurant-buzzer-v3'` must be manually bumped in `sw.js` on each deploy.
**Impact:** Stale cached assets served to clients if version not bumped.
**Suggestion:** Inject cache version from git hash or build timestamp at build time.

### WebSocket Connection Limits
**Issue:** No limit on simultaneous WebSocket connections per order or globally.
**Impact:** A malicious client could exhaust server resources.
**Suggestion:** Add per-IP or per-order connection limits.

### Order Storage — Full PostgreSQL Migration
**Issue:** `MemStorage` loses all orders, messages, subscriptions on restart.
**Impact:** All active orders are lost if the server restarts.
**Migration Path:** Implement `DbStorage` (a PostgreSQL-backed `IStorage`) using the existing Drizzle setup. The interface is already fully abstracted — no route changes required.
