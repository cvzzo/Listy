/*
 * Importato dal service worker generato da vite-plugin-pwa (opzione workbox.importScripts).
 * Sta qui e non dentro il service worker generato per non doverlo scrivere a mano:
 * la precache e le regole offline restano quelle prodotte da workbox.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Un push senza corpo valido non deve buttare giu il service worker
  }

  const title = payload.title || 'Listy'
  const options = {
    body: payload.body || '',
    icon: '/Logo.svg',
    badge: '/Logo.svg',
    // Il tag arriva dal server ed e diverso per ogni tipo di avviso: senza,
    // il promemoria del giorno prima sostituirebbe quello di conferma
    tag: payload.tag || payload.url || 'listy',
    renotify: true,
    // Una notifica senza vibrazione su Android finisce muta nel pannello, senza
    // comparire in evidenza: e la differenza fra accorgersene e trovarla dopo
    vibrate: [200, 100, 200],
    silent: false,
    requireInteraction: payload.keepOpen === true,
    data: { url: payload.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Se l'app e gia aperta la si porta in primo piano e la si naviga, invece
      // di lasciare all'utente due schede della stessa cosa
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
