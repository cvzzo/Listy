import { apiFetch } from '../api/client'

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on'

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

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'

  const subscription = await currentSubscription().catch(() => null)
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

  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  await apiFetch('/push-subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint, keys }),
  })

  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription().catch(() => null)
  if (!subscription) return 'off'

  // Prima il server: se il dispositivo si disiscrive e la riga resta, continueremmo
  // a mandare notifiche a un endpoint morto finche il servizio push non lo dichiara
  await apiFetch('/push-subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {})

  await subscription.unsubscribe()
  return 'off'
}
