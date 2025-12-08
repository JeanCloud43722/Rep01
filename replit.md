# Restaurant Digital Buzzer System

## Overview
A modern digital buzzer system for restaurants that replaces physical buzzers with QR codes and web push notifications. Restaurant staff create orders, customers scan QR codes to subscribe for notifications, and staff can send instant or scheduled alerts when orders are ready.

## Current State
MVP complete with all core features:
- Order creation with unique IDs and QR code generation
- Customer-facing order status page with push notification subscription
- Admin dashboard for managing multiple orders
- Manual and scheduled notification triggers
- In-memory storage for demo purposes

## Project Architecture

### Frontend (client/)
- **React + TypeScript** with Vite bundler
- **Routing**: Wouter for client-side navigation
  - `/` and `/admin` - Admin dashboard for order management
  - `/order/:id` - Customer-facing order status page
- **State Management**: TanStack Query for server state
- **UI Components**: Shadcn/ui with Tailwind CSS
- **Push Notifications**: Service Worker in `client/public/sw.js`

### Backend (server/)
- **Express.js** API server
- **Web Push**: `web-push` library with VAPID key generation
- **Scheduling**: `node-schedule` for timed notifications
- **Storage**: In-memory Map-based storage (`server/storage.ts`)

### Shared (shared/)
- **Type Definitions**: Zod schemas for Order, PushSubscription, etc.
- Shared between frontend and backend for type safety

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/vapid-public-key` | Get VAPID public key for push subscription |
| GET | `/api/orders` | List all orders |
| GET | `/api/orders/:id` | Get single order |
| POST | `/api/orders` | Create new order |
| DELETE | `/api/orders/:id` | Delete order |
| POST | `/api/orders/:id/register` | Auto-register customer (called when they visit) |
| POST | `/api/orders/:id/subscribe` | Subscribe to push notifications (optional) |
| POST | `/api/orders/:id/trigger` | Send immediate notification |
| POST | `/api/orders/:id/message` | Send custom message (without marking order ready) |
| POST | `/api/orders/:id/schedule` | Schedule future notification |
| POST | `/api/orders/:id/service` | Request waiter service |
| POST | `/api/orders/:id/offers` | Add offer to order |
| PATCH | `/api/orders/:id/notes` | Update order notes |
| WebSocket | `/ws/orders?id=:orderId` | Real-time order updates |

## Order Status Flow
1. **waiting** - Order created, awaiting customer subscription
2. **subscribed** - Customer enabled push notifications
3. **scheduled** - Notification scheduled for future time
4. **notified** - Customer has been notified
5. **completed** - Order completed

## Key Files
- `shared/schema.ts` - Data models and Zod schemas
- `server/storage.ts` - In-memory order storage
- `server/routes.ts` - API endpoints and push notification logic
- `client/src/pages/admin.tsx` - Admin dashboard
- `client/src/pages/customer.tsx` - Customer order page
- `client/public/sw.js` - Service worker for push notifications
- `client/src/lib/audio-manager.ts` - Singleton AudioManager with 7 distinct sound cues
- `client/src/lib/device-capabilities.ts` - Device detection (iOS Safari, Android, desktop)
- `client/src/lib/notification-orchestrator.ts` - Multi-channel notification routing

## Development
```bash
npm run dev  # Start development server on port 5000
```

## Recent Changes
- Initial MVP implementation with all core features
- QR code generation using qrcode library
- Web push notification system with VAPID authentication
- Scheduled notifications using node-schedule
- Beautiful responsive UI following design guidelines
- Fixed VAPID key conversion for proper push subscription
- Static VAPID keys from environment variables for persistent subscriptions
- **Simplified customer experience**: Auto-registration when customers visit the order page
- **iOS Safari support**: WebSocket-based notifications work on all devices including iOS
- Push notifications are now optional (used as bonus when browser supports them)
- Added service request feature (Call Waiter button) for customers
- Staff notes feature for orders (visible only on admin dashboard)
- Real-time countdown timer showing remaining time until order is ready
- **Award-winning acoustic notification system**: 7 distinct sound cues with Web Audio API
- **Device capability detection**: Automatic strategy selection for iOS Safari/Android/Desktop
- **Seamless audio auto-enable**: Audio is enabled on ANY user interaction (tap, scroll, click) anywhere on the page - no explicit button click needed
- **Admin real-time alerts**: Staff receive audio/visual notifications for new registrations and service requests
- **Unified notification audio**: Both staff and customers use identical audio signals for consistency:
  - **Loud 800Hz buzzer** on "Notify Now", "Send Notification", "Schedule Notification" (staff side) and order-ready alerts (customer side)
  - Two-tone ascending chime (A5→C#6) for incoming customer messages
  - Three-tone welcome chime (C5→E5→G5) when customer arrives
- **User messages now trigger push notifications**: Staff messages to customers use identical push notification pattern as order-ready alerts (3 retry attempts with 2-second intervals)
- **Bidirectional Messaging**: Customers can send messages to staff directly from the order page (only when push is enabled); messages appear real-time in admin dashboard via WebSocket; reuses same Message data model for unified message history

## Environment Variables
- `VAPID_PUBLIC_KEY` - Public key for web push notifications
- `VAPID_PRIVATE_KEY` - Private key for web push notifications

## How to Use
1. **Create Order**: Click "New Order" button on admin dashboard
2. **Share QR Code**: Click "QR Code" button on order card to display scannable QR
3. **Customer Visits**: Customer scans QR and is automatically registered. Sound alerts are auto-enabled on their first tap/scroll - no buttons to click!
4. **Add Notes**: Click "Notes" button to add table number, name, or other info
5. **Schedule Notification**: Click "Schedule" to set future notification time with countdown
6. **Immediate Notification**: Click "Notify Now" to send alert immediately
7. **Handle Service Requests**: Service requests from customers appear in red on the dashboard

## Notification System
The system uses a multi-channel approach for maximum compatibility across all devices:

### Audio Manager (Singleton)
- Web Audio API with pre-warmed AudioContext for iOS Safari compliance
- 7 distinct sound cues with custom frequency/envelope profiles:
  - **order-ready**: Attention-grabbing 3-pulse sawtooth buzzer (440/523/659 Hz)
  - **message**: Gentle two-tone ascending chime (C5 → E5)
  - **offer**: Celebratory 4-note arpeggio (C5 → E5 → G5 → C6)
  - **status-update**: Quick neutral ping (880 Hz)
  - **service-request**: Urgent descending staccato (A5 → F5 → C5)
  - **new-registration**: Friendly welcome chime (523/659/784 Hz)
  - **order-completed**: Resolution cadence (G5 → C5)
- Volume control with master gain normalization (-12 LUFS target)

### Device Capabilities Detection
- Platform identification: iOS Safari, Android Chrome, Desktop browsers
- Feature detection flags: webAudio, push, notifications, vibration, screenWake
- Automatic notification strategy selection based on capabilities

### Notification Orchestrator
- Routes WebSocket events to appropriate audio/visual/haptic channels
- Per-event-type throttling (3-second cooldown by default)
- Tab badge updates with unseen notification count
- Haptic vibration patterns for supported devices
- Role-aware audio (customer vs staff sounds)

### Channels
- **WebSocket**: Real-time updates on all devices including iOS Safari
  - Customer: `/ws/orders?id=:orderId`
  - Admin: `/ws/admin`
- **Push Notifications**: Optional enhancement for supported browsers
- **Haptic Feedback**: Vibration patterns for mobile devices
- **Visual Indicators**: Tab badge count, color-coded status cards
- **Polling**: Fallback every 4 seconds for missed updates

## Event Types
The WebSocket sends typed events for differentiated responses:
- `order_ready`: Order is ready for pickup
- `message`: Staff sent a custom message
- `service_request`: Customer pressed "Call Waiter"
- `offer`: Special offer added to order
- `status_update`: General status change
- `new_registration`: Customer scanned QR and registered (admin only)
- `order_completed`: Order marked as completed

## Known Limitations
- Data is stored in-memory and will be lost on server restart (for demo purposes)
- For production use, implement PostgreSQL database for persistent storage
