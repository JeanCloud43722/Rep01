self.addEventListener("install", (event) => {
  console.log("Service Worker installed");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  event.waitUntil(clients.claim());
});

self.addEventListener("push", (event) => {
  console.log("Push event received");
  
  let data = {
    title: "Order Ready!",
    body: "Your order is ready for pickup!",
    icon: "/favicon.png",
    badge: "/favicon.png"
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  // Log delivery confirmation (best-effort analytics)
  const timestamp = new Date().toISOString();
  console.log(`[Push Delivered] ${timestamp} - Title: ${data.title}, URL: ${data.url}`);
  
  const options = {
    body: data.body,
    icon: data.icon || "/favicon.png",
    badge: data.badge || "/favicon.png",
    vibrate: [200, 100, 200, 100, 200],
    tag: "order-notification",
    renotify: true,
    requireInteraction: true,
    silent: false,
    sound: "data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAAA=",
    data: {
      url: data.url || "/",
      deliveredAt: timestamp
    },
    // Action buttons for better UX
    actions: [
      {
        action: "open",
        title: "View Order",
        icon: "/favicon.png"
      },
      {
        action: "close",
        title: "Dismiss",
        icon: "/favicon.png"
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log("Notification action:", event.action);
  event.notification.close();
  
  // Handle action buttons
  if (event.action === "close") {
    return;
  }
  
  const url = event.notification.data?.url || "/";
  const deliveredAt = event.notification.data?.deliveredAt;
  
  if (deliveredAt) {
    const clickedAt = new Date().toISOString();
    console.log(`[Push Interaction] Delivered at ${deliveredAt}, clicked at ${clickedAt}`);
  }
  
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
