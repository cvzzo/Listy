import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { clearFamilyData, db } from '../lib/db/db'
import { closeAblyClient } from '../lib/ably/client'
import { registerPushForAllFamilies, unregisterPushForFamily } from '../lib/push/push'
import { pullAllFamilies, syncFamily } from '../lib/sync/engine'
import {
  getActiveFamilyId,
  getSessions,
  removeSession,
  setActiveFamily,
  type Session,
} from '../lib/auth/session'
import { shareInvite } from '../lib/invite/share'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import FamilyAuthForm from '../components/FamilyAuthForm'
import {
  IconArrowLeft,
  IconChevronRight,
  IconLogout,
  IconPlus,
  IconShare,
} from '../components/icons'

function Families() {
  const navigate = useNavigate()
  // Le sessioni stanno in localStorage, non in Dexie: qui se ne tiene una copia
  // di stato per ridisegnare quando se ne aggiunge o se ne toglie una
  const [sessions, setSessions] = useState<Session[]>(getSessions)
  const [activeFamilyId, setActiveFamilyIdState] = useState(getActiveFamilyId)
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState<Session | null>(null)
  const [copied, setCopied] = useState(false)

  // Il motore sincronizza solo la famiglia aperta: qui servono tutte, altrimenti
  // le altre mostrerebbero i conteggi di quando le si e viste l'ultima volta
  useEffect(() => {
    pullAllFamilies()
  }, [])

  const familyIds = sessions.map((s) => s.family.id)
  const counts = useLiveQuery(async () => {
    const map = new Map<string, number>()
    for (const familyId of familyIds) {
      map.set(
        familyId,
        await db.items
          .where('familyId')
          .equals(familyId)
          .and((i) => !i.deletedAt && !i.checked)
          .count(),
      )
    }
    return map
  }, [familyIds.join(',')])

  function openFamily(session: Session) {
    setActiveFamily(session.family.id)
    enterActiveFamily()
    syncFamily(session.family.id)
  }

  /** Quel che va rifatto ogni volta che cambia la famiglia sotto i piedi dell'app. */
  function enterActiveFamily() {
    // Il canale realtime e legato alla famiglia di prima: va chiuso qui, prima che
    // le liste si montino e ne chiedano uno nuovo
    closeAblyClient()
    navigate('/liste')
  }

  async function leaveFamily(session: Session) {
    setLeaving(null)
    // Finche la sessione c'e, c'e anche il token per farsi togliere dalle notifiche
    await unregisterPushForFamily(session)
    removeSession(session.family.id)
    await clearFamilyData(session.family.id)
    closeAblyClient()

    const remaining = getSessions()
    setSessions(remaining)
    setActiveFamilyIdState(getActiveFamilyId())
    if (remaining.length === 0) navigate('/')
  }

  async function share(session: Session) {
    if ((await shareInvite(session.family)) !== 'copied') return
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="families-page">
      <header className="app-header app-header-compact">
        {/* Torna dove si era: senza famiglia attiva non c'e un "dove" a cui tornare */}
        {activeFamilyId ? (
          <Link to="/liste" className="icon-btn" aria-label="Torna alle liste">
            <IconArrowLeft />
          </Link>
        ) : null}
        <div className="app-header-title">
          <h1>Le tue famiglie</h1>
        </div>
      </header>

      {copied && (
        <div className="activity-notice" role="status">
          Link d'invito copiato
        </div>
      )}

      <div className="page-content">
        <ul className="list-cards">
          {sessions.map((session) => {
            const remaining = counts?.get(session.family.id) ?? 0
            const isActive = session.family.id === activeFamilyId

            return (
              <li key={session.family.id} className="list-card">
                <button
                  type="button"
                  className={isActive ? 'list-card-link family-card active' : 'list-card-link family-card'}
                  onClick={() => openFamily(session)}
                >
                  <span className="list-card-text">
                    <span className="list-card-name">{session.family.name}</span>
                    <span className="family-meta">
                      <span className="invite-code">{session.family.inviteCode}</span>
                      <span className="family-member">come {session.member.displayName}</span>
                    </span>
                  </span>
                  {remaining > 0 && <span className="count-badge">{remaining}</span>}
                  <IconChevronRight className="chevron" />
                </button>
                <ActionMenu
                  label={`Azioni per ${session.family.name}`}
                  triggerClassName="icon-btn-ghost"
                  placement="auto"
                  groups={[
                    [
                      {
                        label: "Condividi il link d'invito",
                        icon: <IconShare size={18} />,
                        onSelect: () => share(session),
                      },
                    ],
                    [
                      {
                        label: 'Esci da questa famiglia',
                        icon: <IconLogout size={18} />,
                        danger: true,
                        onSelect: () => setLeaving(session),
                      },
                    ],
                  ]}
                />
              </li>
            )
          })}
        </ul>

        {adding ? (
          <section className="add-family">
            <FamilyAuthForm
              // Chi e gia in una famiglia quasi sempre ne sta raggiungendo un'altra
              initialMode="join"
              // La nuova famiglia e gia attiva: da qui in poi e come averla scelta,
              // con in piu le notifiche da attivare anche per lei
              onDone={() => {
                registerPushForAllFamilies()
                enterActiveFamily()
              }}
            />
            <button type="button" className="add-category-toggle" onClick={() => setAdding(false)}>
              Annulla
            </button>
          </section>
        ) : (
          <button type="button" className="add-category-toggle" onClick={() => setAdding(true)}>
            <IconPlus size={16} /> Aggiungi una famiglia
          </button>
        )}
      </div>

      <ConfirmDialog
        open={leaving !== null}
        title="Uscire dalla famiglia?"
        message={`Uscirai da "${leaving?.family.name}" su questo dispositivo. Le altre famiglie restano. Potrai rientrare in qualsiasi momento con il codice invito.`}
        confirmLabel="Esci"
        cancelLabel="Annulla"
        danger
        onCancel={() => setLeaving(null)}
        onConfirm={() => leaving && leaveFamily(leaving)}
      />
    </main>
  )
}

export default Families
