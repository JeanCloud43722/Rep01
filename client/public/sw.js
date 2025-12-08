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
      url: data.url || "/"
    }
  };
  
  // Send message to all open client pages to trigger audio buzzer
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
        console.log("Sending ORDER_READY message to", clientList.length, "clients");
        clientList.forEach((client) => {
          client.postMessage({ type: "ORDER_READY", data: data });
        });
      })
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  console.log("Notification clicked");
  event.notification.close();
  
  const url = event.notification.data?.url || "/";
  
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
