# Restaurant Digital Buzzer System

## Overview
This project develops a modern digital buzzer system for restaurants, replacing traditional physical buzzers with a QR code and web push notification-based solution. It enables restaurant staff to create orders and send instant or scheduled alerts to customers when orders are ready. Customers can subscribe to notifications by scanning a QR code. The system enhances customer experience and streamlines restaurant operations through timely communication, order management, multi-channel notifications (audio, visual, haptic, WebSocket, push), and an AI guest assistant for customer inquiries. The business vision is to provide a scalable, user-friendly, and technologically advanced solution for managing customer queues and order readiness.

## User Preferences
I prefer detailed explanations and iterative development. I want to be asked before major changes are made.

## System Architecture

### UI/UX Decisions
The system features a responsive UI built with Shadcn/ui and Tailwind CSS, including an admin dashboard and a customer-facing order status page. Key UI/UX elements include internationalization (English and German) with localStorage persistence, local timezone display for countdown timers, and an award-winning acoustic notification system with 7 distinct sound cues. It offers a Zero-Friction UX with automatic audio and push notification enablement on first user interaction and full PWA support for an installable, app-like experience.

### Technical Implementations
The frontend is developed with React + TypeScript, Vite, Wouter for routing, and TanStack Query for state management. The backend uses Express.js. PostgreSQL via Drizzle ORM serves as the primary production storage. Zod schemas ensure type safety across frontend and backend.
Push notifications are handled via a Service Worker and the `web-push` library. `node-schedule` manages timed notifications. Winston is used for structured logging, and `server/env-validation.ts` validates environment variables.
Real-time communication is established using WebSockets for both customer and admin interfaces, featuring heartbeat, client ID management, and robust reconnection logic. A fully restored Web Push Notification system with VAPID key support allows reliable notifications even when the app is backgrounded.
An `AudioManager` uses the Web Audio API for managing sound cues, and notification orchestration routes WebSocket events to appropriate audio, visual, and haptic channels. Device capability detection optimizes notification strategies.
The AI Guest Assistant utilizes an improved TF-IDF retrieval system with **prefix matching** for compound German words (e.g., "pute" matches "Putenbruststeaks"), German umlaut normalization (ä→a, ö→o, ü→u), and extended context window (topK=10 instead of 5) for better retrieval of rare/specific terms. Integrated with optional web search and DeepSeek AI for generating concise, cited answers.
Stock validation, smart upsell suggestions based on culinary principles, and thermal receipt generation for kitchen printers are integrated. Chat soft lock mechanisms disable chat input during order confirmation processes.
A product catalog extraction pipeline dynamically generates categories from PDFs, supports fuzzy deduplication, product variants, and broadcasts `MENU_UPDATED` events via an in-process event bus.
The admin dashboard header prioritizes urgent items using an urgency-based sorting algorithm and visual cues. An Activity Feed provides a real-time log of events (messages, service requests, order updates) with unread counts and interactive elements. A refactored MessageModal (v1.0) transforms one-shot message composition into a persistent two-way chat UI with full conversation history, quick reply templates, auto-scroll, and modal persistence across sends. View toggles (Prompt 31.4 v1.0) enable switching between Grid and Kanban layouts with localStorage persistence; Grid shows masonry 1-3 column layout (default), Kanban shows 3 status columns (Waiting/Scheduled, Preparing, Completed) with horizontal scroll on mobile.
An event bus (`server/lib/event-bus.ts`) facilitates in-process pub/sub for critical system events.
AI Ordering Chat integrates DeepSeek tool-calling for product searches and intelligent upselling. Server-side price validation and idempotency keys ensure robust order confirmation. Real-time product catalog updates are handled via a React hook that listens for WebSocket events.
The ProductCatalog UI includes dynamic category tabs, product cards with variant pricing, product modals for selection, and a cart sidebar that persists to localStorage and can inject natural-language order summaries into the GuestAssistant.

### Feature Specifications
The system supports a detailed order status flow (`waiting` -> `subscribed` -> `scheduled` -> `notified` -> `completed`) with reactivation capabilities. Customer features include QR scanning, optional push subscriptions, service requests, custom messages, and real-time countdowns. Admin features encompass comprehensive order management, manual/scheduled notifications, staff notes, and real-time alerts. Bidirectional messaging between customers and staff is unified via WebSockets. Offline capabilities are supported through IndexedDB and Service Worker caching. QR code scanning uses `html5-qrcode`. The Product Catalog API supports advanced filtering, ETag caching, and free-form category strings. A CLI tool `extract-products.ts` automates product catalog updates.

## External Dependencies

- **PostgreSQL**: Primary persistent storage, accessed via Drizzle ORM and Neon.
- **web-push**: Node.js library for sending web push notifications with VAPID key support.
- **node-schedule**: For scheduling notifications.
- **i18next & react-i18next**: For internationalization.
- **Shadcn/ui & Tailwind CSS**: UI component library and styling.
- **TanStack Query**: Frontend server state management.
- **Wouter**: React routing library.
- **Vite**: Frontend build tool.
- **Winston**: Backend logging.
- **Zod**: Schema validation and type definition sharing.
- **pdf-parse / mammoth**: For document ingestion.
- **SerpApi / Google Custom Search**: Optional for AI web search integration.
- **DeepSeek AI**: AI guest assistant's core response generation.
- **html5-qrcode**: QR code scanning.