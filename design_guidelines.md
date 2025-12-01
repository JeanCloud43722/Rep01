# Design Guidelines: Restaurant Digital Buzzer System

## Design Approach
**System Selected:** Material Design 3 principles with modern minimalism  
**Rationale:** This is a utility-focused operational tool requiring clarity, efficiency, and mobile-first accessibility. Material Design provides excellent patterns for dashboards, forms, and status management while maintaining professional polish.

## Core Design Principles
1. **Operational Clarity** - Status and actions must be immediately visible
2. **Mobile-First** - Customers access via mobile QR scans
3. **Admin Efficiency** - Quick order creation and notification triggers
4. **Trust & Reliability** - Professional appearance builds confidence

## Typography System
- **Primary Font:** Inter (Google Fonts) - clean, readable, professional
- **Hierarchy:**
  - Page Headers: 2xl / semibold (admin), xl / bold (customer)
  - Section Titles: lg / semibold
  - Body Text: base / normal
  - Labels/Metadata: sm / medium
  - Order IDs/Status: mono font for technical clarity

## Layout System
**Spacing Units:** Tailwind units of 3, 4, 6, and 8 for consistent rhythm
- Component padding: p-4 to p-6
- Section spacing: space-y-6 to space-y-8
- Card gaps: gap-4
- Container max-width: max-w-4xl for admin, max-w-md for customer view

## Component Library

### Admin Dashboard
**Order Management Grid:**
- Card-based layout with clear status indicators
- Each order card contains: Order ID (prominent), timestamp, status badge, QR code thumbnail, action buttons
- Grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Status badges: Distinct visual states (Waiting, Subscribed, Notified, Completed)

**Order Creation Panel:**
- Prominent "Create New Order" button (primary action)
- Simple modal or dedicated section
- Success state shows generated QR code large and centered
- Copy-to-clipboard functionality for order links

**Notification Controls:**
- Two-tab or toggle interface: "Send Now" vs "Schedule"
- DateTime picker: Clean, modern temporal input
- Visual confirmation on trigger success

### Customer Interface
**Order Status Page:**
- Centered single-column layout (max-w-md mx-auto)
- Large order ID display at top
- Clear status message with iconography
- Prominent "Enable Notifications" button (if not subscribed)
- Subscription confirmed state with checkmark icon
- Minimal, calming design - customer should feel informed, not overwhelmed

### QR Code Display
- Large, scannable QR code (300x300px minimum)
- High contrast background
- Clear instructions: "Share this QR code with customer"
- Download/print options

## Visual Elements

### Status Indicators
- **Waiting:** Neutral state, subtle outline
- **Subscribed:** Success indication with icon
- **Scheduled:** Clock icon with time display
- **Notified:** Completion state
- Use iconography from Heroicons for consistency

### Buttons
- Primary actions: Solid buttons with clear hierarchy
- Secondary actions: Outlined or ghost buttons
- Icon buttons for delete/edit actions
- Disabled states clearly distinguished

### Cards & Containers
- Subtle borders and shadows for depth
- Rounded corners (rounded-lg)
- Hover states on interactive cards
- Responsive padding (p-4 to p-6)

## Screen-Specific Guidelines

### Admin Dashboard
- Header: App title, create order button (right-aligned)
- Filters/search bar if multiple orders
- Order grid with clear visual hierarchy
- Empty state with friendly illustration and CTA

### Customer Page
- Minimal chrome - focus on essential info
- Large typography for readability on mobile
- Single primary action (notification enable)
- Reassuring messaging about order status
- Loading states during subscription process

### QR Code Modal/Page
- QR code prominently centered
- Order ID clearly labeled above
- Instructions in readable size below
- Action buttons: Download, Copy Link, Close

## Responsive Behavior
- **Mobile (base):** Single column, full-width cards, stacked actions
- **Tablet (md):** 2-column grid for admin, larger touch targets
- **Desktop (lg):** 3-column grid, hover interactions enabled

## Accessibility
- ARIA labels for all interactive elements
- Focus states with clear outlines
- Sufficient color contrast (WCAG AA minimum)
- Screen reader friendly status announcements
- Keyboard navigation support throughout

## Animation & Feedback
- Subtle fade-in for new orders
- Success animations on notification send
- Toast notifications for admin actions
- Loading spinners during async operations
- Keep animations minimal and purposeful (200-300ms duration)

## Images
No hero images required. This is a functional tool prioritizing efficiency over marketing appeal. Use iconography strategically for status indicators and empty states only.