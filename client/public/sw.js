// Minimal service worker: only exists to receive push events (new-order
// notifications for staff) and show them. No offline caching -- that's a
// separate concern this app doesn't need yet.
self.addEventListener('push', (event) => {
  let data = { title: 'Al Chark', body: 'You have a new notification.' };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Al Chark', {
      body: data.body,
      icon: '/icon.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
