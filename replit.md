# Restaurant Digital Buzzer System

## Overview
This project develops a modern digital buzzer system for restaurants. It replaces traditional physical buzzers with a QR code and web push notification-based solution. The system allows restaurant staff to create orders, customers to subscribe to notifications by scanning a QR code, and staff to send instant or scheduled alerts when orders are ready. The system aims to enhance the customer experience and streamline restaurant operations by providing timely and efficient communication. Key capabilities include order management, multi-channel notifications (audio, visual, haptic, WebSocket, push), and an AI guest assistant for customer inquiries. The business vision is to offer a scalable, user-friendly, and technologically advanced solution for restaurants to manage customer queues and order readiness.

## User Preferences
I prefer detailed explanations and iterative development. I want to be asked before major changes are made.

## System Architecture

### UI/UX Decisions
The system features a responsive UI built with Shadcn/ui and Tailwind CSS. It includes an admin dashboard for staff and a customer-facing order status page. Key UI/UX elements are:
- **Internationalization (i18n)**: English and German language support with localStorage persistence for customer preferences.
- **Local Timezone Display**: Countdown timers on the customer page adjust to the customer's detected local timezone.
- **Award-winning acoustic notification system**: 7 distinct sound cues using Web Audio API for customer and staff alerts.
- **Zero-Friction UX**: Automatic audio and push notification enablement on the first user interaction (tap, scroll, click) without explicit buttons or blocking overlays.
- **PWA Support**: Manifest, Service Worker caching, and Apple meta tags for an installable, app-like experience on mobile, including an iOS install prompt.

### Technical Implementations
- **Frontend**: Developed with React + TypeScript, Vite, Wouter for routing, and TanStack Query for state management.
- **Backend**: Implemented using Express.js.
- **Shared**: Zod schemas for type-safe data models across frontend and backend.
- **Push Notifications**: Utilizes a Service Worker (`client/public/sw.js`) and the `web-push` library with VAPID key generation.
- **Scheduling**: `node-schedule` is used for managing timed notifications.
- **Logging**: Winston for structured logging with JSON output in production and colorized output in development.
- **Environment Validation**: `server/env-validation.ts` ensures all required environment variables are set at startup.
- **Real-time Communication**: WebSockets (`/ws/orders?id=:orderId` for customers, `/ws/admin` for admin) provide real-time updates with heartbeat/keep-alive, client ID management, exponential backoff reconnection, and Page Visibility API integration for robust cross-platform messaging.
- **Audio Management**: A singleton `AudioManager` uses Web Audio API with pre-warmed AudioContext and handles resume on interaction/visibility.
- **Notification Orchestration**: Routes WebSocket events to appropriate audio, visual, and haptic channels, including throttling, tab badge updates, and role-aware audio.
- **Device Capability Detection**: Identifies platform (iOS Safari, Android, Desktop) and feature support (Web Audio, Push, Notifications, Vibration, Screen Wake) to select optimal notification strategies.
- **AI Guest Assistant**: Features an in-memory TF-IDF retrieval system for a knowledge base, optional web search integration, and DeepSeek AI for generating concise answers with source citations.
- **Product Catalog Extraction (v2.0)**: Six-optimization pipeline: (1) dynamic categories from PDF section headers (no hardcoded enum), (2) fuzzy deduplication with existing-product context sent to DeepSeek, (3) product variants support (JSONB, size/type-based pricing), (4) WebSocket MENU_UPDATED broadcast via in-process event bus after extraction, (5) fire-and-forget async image generation (Stability AI, rate-limited to 5/run), (6) zero TypeScript errors via `types/global.d.ts` for pdf-parse.
- **Event Bus**: `server/lib/event-bus.ts` — Node.js EventEmitter singleton for in-process pub/sub (`menu:updates` channel). Routes.ts subscribes and forwards events to all customer + admin WebSocket clients.
- **Real-time Product Catalog Hook**: `client/src/hooks/use-product-catalog.ts` — React hook that connects to `/ws/admin`, listens for `MENU_UPDATED`/`PRODUCT_IMAGE_ADDED` events, and auto-invalidates the TanStack Query products cache.
- **ProductCatalog UI (v2.0)**: `client/src/components/ProductCatalog/` — Full component suite: `types.ts` (shared interfaces, localStorage cart helpers, sanitizeInput, buildOrderMessage), `CategoryTabs.tsx` (dynamic tabs from API data, keyboard nav), `ProductCard.tsx` (React.memo with variant-aware pricing), `ProductModal.tsx` (Dialog with RadioGroup variant picker, quantity selector, modifications textarea, WCAG focus trap), `CartSidebar.tsx` (sticky expandable card with quantity controls, send-to-chat injection), `ProductCatalog.tsx` (main: useDebounce search, useQuery with ETag, MENU_UPDATED/PRODUCT_IMAGE_ADDED invalidation via customer WS onMessage). Cart is persisted to localStorage with 24h TTL. "Send to Assistant" injects a natural-language order summary into the GuestAssistant via `pendingOrder` prop, auto-opening and pre-filling the question input. All animations use `motion-safe:` Tailwind variants for `prefers-reduced-motion` compliance.

### Feature Specifications
- **Order Status Flow**: `waiting` -> `subscribed` -> `scheduled` -> `notified` -> `completed`. Supports `reactivation` for multi-round orders (e.g., appetizer, main, dessert).
- **Customer Features**: QR code scanning, optional push notification subscription, service requests ("Call Waiter"), custom messages to staff, real-time countdown timer, and AI guest assistant.
- **Admin Features**: Order creation, deletion, management, manual and scheduled notification triggers, staff notes, and real-time alerts for new registrations and service requests.
- **Bidirectional Messaging**: Customers can send messages to staff, appearing real-time on the admin dashboard via WebSocket, unifying message history.
- **Offline Capabilities**: IndexedDB for message persistence, especially addressing iOS data eviction, and Service Worker caching for offline access.
- **QR Code Scanning**: Uses `html5-qrcode` for live scanning with photo upload fallback for iOS.
- **Product Catalog**: `GET /api/products` with `category`, `categoryGroup`, `search`, `tags`, `limit` query params; ETag + 304 support; category accepts any free-form string (no enum restriction).
- **Product Extraction CLI**: `npx tsx scripts/extract-products.ts [--dry-run] [--skip-images] [--category <name>]`

## External Dependencies

- **PostgreSQL**: Used for persistent storage via Drizzle ORM and Neon serverless.
- **Web-Push**: Node.js library for sending web push notifications.
- **Node-Schedule**: For scheduling future notifications.
- **i18next & react-i18next**: For internationalization in the frontend.
- **Shadcn/ui & Tailwind CSS**: UI component library and styling framework.
- **TanStack Query**: For server state management in the frontend.
- **Wouter**: A small routing library for React.
- **Vite**: Frontend build tool.
- **Winston**: A versatile logging library for the backend.
- **Zod**: For schema validation and type definition sharing.
- **pdf-parse / mammoth**: For document ingestion in the AI knowledge base.
- **SerpApi / Google Custom Search**: Optional for real-time web search integration in the AI assistant.
- **DeepSeek AI**: Used by the AI guest assistant to generate responses.
- **html5-qrcode**: For QR code scanning functionality.