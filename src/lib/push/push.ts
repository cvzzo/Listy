import { apiFetch } from '../api/client'
import { getSessions, type Session } from '../auth/session'

export type PushState = 'unsupported' | 'unavailable' | 'blocked' | 'off' | 'on'

/**
 * Su iPhone il Push funziona solo per le web app aggiunte alla schermata Home:
 * in Safari come scheda normale l'API non c'e proprio, e la distinzione va
 * spiegata all'utente invece di lasciarlo davanti a un pulsante che non fa nulla.
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIosWithoutHomeScreen(): boolean {
  if (isPushSupported()) return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua)
  const standalone = (navigator as { standalone?: boolean }).standalone === true
  return isIos && !standalone
}

/**
 * navigator.serviceWorker.ready non si risolve mai finche un service worker non e
 * registrato: in sviluppo non lo e affatto, e sul sito vero potrebbe fallire.
 * Senza limite di tempo lo stato resterebbe in sospeso per sempre e il menu
 * direbbe "non disponibili" senza che nessuno sappia perche.
 */
async function readyRegistration(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await readyRegistration()
  return registration ? registration.pushManager.getSubscription() : null
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'

  // Nessun service worker attivo: il browser saprebbe farlo, ma qui non c'e chi
  // riceve la notifica. Succede in sviluppo, dove il service worker non viene
  // registrato affatto.
  const registration = await readyRegistration().catch(() => null)
  if (!registration) return 'unavailable'

  const subscription = await registration.pushManager.getSubscription().catch(() => null)
  return subscription ? 'on' : 'off'
}

// La chiave arriva dal server in base64url e PushManager la vuole come byte.
// L'ArrayBuffer va costruito esplicitamente: Uint8Array.from produce un tipo
// generico che applicationServerKey non accetta.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  const raw = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Il browser da una sola iscrizione per dispositivo, ma le famiglie sono tante e
 * ognuna manda le sue notifiche: la stessa iscrizione va quindi depositata presso
 * ciascuna, con il token di quella famiglia. Il server ne tiene una riga per
 * coppia (dispositivo, famiglia).
 */
async function registerWithEveryFamily(subscription: PushSubscription) {
  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  const body = JSON.stringify({ endpoint, keys })

  await Promise.all(
    getSessions().map((session) =>
      apiFetch('/push-subscribe', { method: 'POST', body }, session),
    ),
  )
}

export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'

  // Il permesso va chiesto da un gesto dell'utente, altrimenti i browser lo negano
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'

  const { publicKey } = await apiFetch<{ publicKey: string }>('/push-key')
  const registration = await navigator.serviceWorker.ready

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  await registerWithEveryFamily(subscription)
  return 'on'
}

/**
 * Ripassa da tutte le famiglie con l'iscrizione che il dispositivo ha gia. Serve
 * quando se ne raggiunge una nuova mentre le notifiche erano attive, e all'avvio,
 * per quelle a cui il dispositivo non si era ancora presentato. E idempotente:
 * riscrivere una riga che c'e gia non cambia niente. Senza notifiche attive non
 * c'e niente da fare.
 */
export async function registerPushForAllFamilies() {
  const subscription = await currentSubscription().catch(() => null)
  if (!subscription) return
  // Un fallimento non ha conseguenze visibili adesso: si recupera riattivando le
  // notifiche, che ripassa da tutte le famiglie
  await registerWithEveryFamily(subscription).catch(() => {})
}

/**
 * Toglie questo dispositivo da una famiglia sola, lasciando le altre. Va chiamata
 * prima di dimenticare la sessione: dopo, non ci sarebbe piu il token per farlo e
 * la famiglia continuerebbe a mandare notifiche a chi se n'e andato.
 */
export async function unregisterPushForFamily(session: Session) {
  const subscription = await currentSubscription().catch(() => null)
  if (!subscription) return

  await apiFetch(
    '/push-subscribe',
    { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) },
    session,
  ).catch(() => {})
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription().catch(() => null)
  if (!subscription) return 'off'

  // Prima il server, e per ogni famiglia: se il dispositivo si disiscrive e le righe
  // restano, continueremmo a mandare notifiche a un endpoint morto finche il
  // servizio push non lo dichiara tale
  const body = JSON.stringify({ endpoint: subscription.endpoint })
  await Promise.all(
    getSessions().map((session) =>
      apiFetch('/push-subscribe', { method: 'DELETE', body }, session).catch(() => {}),
    ),
  )

  await subscription.unsubscribe()
  return 'off'
}
