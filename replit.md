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
| POST | `/api/orders/:id/subscribe` | Subscribe to push notifications |
| POST | `/api/orders/:id/trigger` | Send immediate notification |
| POST | `/api/orders/:id/schedule` | Schedule future notification |

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
