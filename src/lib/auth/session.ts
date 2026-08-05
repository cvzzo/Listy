import type { Family, Member } from '../types'

const STORAGE_KEY = 'listy.sessions'
/** La chiave di quando la sessione era una sola. Letta una volta e poi rimossa. */
const LEGACY_KEY = 'listy.session'

export type Session = {
  token: string
  family: Family
  member: Member
}

type Store = {
  sessions: Session[]
  /** Quale famiglia sta guardando l'utente adesso. null solo quando non ce n'e nessuna. */
  activeFamilyId: string | null
}

const EMPTY: Store = { sessions: [], activeFamilyId: null }

function write(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function read(): Store {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Store
      if (Array.isArray(parsed.sessions)) return parsed
    } catch {
      // storage corrotto: meglio ripartire che bloccare l'app
    }
    return EMPTY
  }

  // Prima apertura dopo l'aggiornamento: la vecchia sessione singola diventa la
  // prima della lista, cosi chi usava gia l'app non si ritrova sloggato
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (!legacy) return EMPTY
  try {
    const session = JSON.parse(legacy) as Session
    const migrated: Store = { sessions: [session], activeFamilyId: session.family.id }
    write(migrated)
    localStorage.removeItem(LEGACY_KEY)
    return migrated
  } catch {
    localStorage.removeItem(LEGACY_KEY)
    return EMPTY
  }
}

/** Tutte le famiglie a cui questo dispositivo e iscritto, nell'ordine di ingresso. */
export function getSessions(): Session[] {
  return read().sessions
}

/**
 * La sessione della famiglia attiva. E questa che usano le API, il canale realtime
 * e le viste: il resto dell'app continua a ragionare su una famiglia per volta.
 */
export function getSession(): Session | null {
  const { sessions, activeFamilyId } = read()
  return sessions.find((s) => s.family.id === activeFamilyId) ?? null
}

export function getSessionFor(familyId: string): Session | null {
  return read().sessions.find((s) => s.family.id === familyId) ?? null
}

export function getActiveFamilyId(): string | null {
  return read().activeFamilyId
}

/**
 * Aggiunge la famiglia e la rende attiva. Rientrare in una famiglia che c'e gia
 * ne aggiorna il token invece di duplicarla: e lo stesso dispositivo che rinnova
 * l'accesso, non una seconda iscrizione.
 */
export function addSession(session: Session) {
  const { sessions } = read()
  const others = sessions.filter((s) => s.family.id !== session.family.id)
  write({ sessions: [...others, session], activeFamilyId: session.family.id })
}

export function setActiveFamily(familyId: string) {
  const store = read()
  if (!store.sessions.some((s) => s.family.id === familyId)) return
  write({ ...store, activeFamilyId: familyId })
}

/**
 * Esce da una famiglia. Se era quella attiva passa alla prima rimasta, cosi
 * l'utente non resta senza contesto quando ne ha altre.
 */
export function removeSession(familyId: string) {
  const { sessions, activeFamilyId } = read()
  const remaining = sessions.filter((s) => s.family.id !== familyId)
  write({
    sessions: remaining,
    activeFamilyId:
      activeFamilyId === familyId ? (remaining[0]?.family.id ?? null) : activeFamilyId,
  })
}

/** Esce dalla famiglia attiva. La usa anche apiFetch quando il token non vale piu. */
export function clearSession() {
  const activeFamilyId = read().activeFamilyId
  if (activeFamilyId) removeSession(activeFamilyId)
}
