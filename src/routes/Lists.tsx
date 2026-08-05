import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, clearFamilyData } from '../lib/db/db'
import { enqueueAndFlush } from '../lib/sync/engine'
import { closeAblyClient } from '../lib/ably/client'
import { getSession, getSessions, removeSession } from '../lib/auth/session'
import { shareInviteCode } from '../lib/invite/share'
import {
  IconArrowLeft,
  IconBell,
  IconCalendar,
  IconCart,
  IconChevronRight,
  IconLogout,
  IconPlus,
  IconShare,
  IconTrash,
} from '../components/icons'
import ActionMenu from '../components/ActionMenu'
import ConfirmDialog from '../components/ConfirmDialog'
import SchedulePicker from '../components/SchedulePicker'
import Toast from '../components/Toast'
import { formatWhen, isPast } from '../lib/format/when'
import {
  disablePush,
  enablePush,
  getPushState,
  isIosWithoutHomeScreen,
  registerPushForAllFamilies,
  unregisterPushForFamily,
  type PushState,
} from '../lib/push/push'
import { useUndoToast } from '../hooks/useUndoToast'
import type { List } from '../lib/types'

function Lists() {
  const navigate = useNavigate()
  const session = getSession()
  const [newListName, setNewListName] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [schedulingList, setSchedulingList] = useState<List | null>(null)
  const [pushState, setPushState] = useState<PushState>('unsupported')
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    getPushState().then((state) => {
      setPushState(state)
      // Le famiglie raggiunte mentre le notifiche erano gia attive non hanno mai
      // visto questo dispositivo: qui si presenta a tutte, una volta per avvio
      if (state === 'on') registerPushForAllFamilies()
    })
  }, [])

  async function togglePush() {
    setPushError(null)
    try {
      setPushState(pushState === 'on' ? await disablePush() : await enablePush())
    } catch {
      // Il caso piu probabile e che le chiavi VAPID non siano configurate sul server
      setPushError('Non sono riuscito ad attivare le notifiche')
      setPushState(await getPushState())
    }
  }

  function pushMenuLabel() {
    if (pushState === 'on') return 'Disattiva notifiche'
    if (pushState === 'blocked') return 'Notifiche bloccate dal browser'
    if (pushState === 'unavailable') return 'Notifiche non ancora pronte'
    if (pushState === 'unsupported') {
      return isIosWithoutHomeScreen()
        ? 'Aggiungi a Home per le notifiche'
        : 'Notifiche non disponibili qui'
    }
    return 'Attiva notifiche'
  }
  const { pending, showUndo, confirmUndo, dismiss } = useUndoToast()

  const lists = useLiveQuery(async () => {
    if (!session) return []
    return db.lists
      .where('familyId')
      .equals(session.family.id)
      .and((l) => !l.deletedAt)
      .sortBy('position')
  }, [session?.family.id]) ?? []

  // Una passata sola su tutti gli articoli della famiglia invece di una query per
  // lista: le liste sono poche ma le interrogazioni Dexie non sono gratis
  const counts = useLiveQuery(async () => {
    const empty = new Map<string, { remaining: number; total: number }>()
    if (!session) return empty

    const familyItems = await db.items
      .where('familyId')
      .equals(session.family.id)
      .and((i) => !i.deletedAt)
      .toArray()

    for (const item of familyItems) {
      const entry = empty.get(item.listId) ?? { remaining: 0, total: 0 }
      entry.total += 1
      if (!item.checked) entry.remaining += 1
      empty.set(item.listId, entry)
    }
    return empty
  }, [session?.family.id])

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name || !session) return

    // Svuota subito: farlo dopo le scritture lascia il testo nel campo per qualche
    // decina di millisecondi e cancella quello che si sta gia digitando
    setNewListName('')

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.lists.add({
      id,
      familyId: session.family.id,
      name,
      position: new Date(now).getTime(),
      createdBy: session.member.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await enqueueAndFlush({ id, entity: 'list', op: 'create', payload: { name }, clientTimestamp: now })
  }

  async function deleteList(list: List) {
    const now = new Date().toISOString()
    await db.lists.update(list.id, { deletedAt: now, updatedAt: now })
    await enqueueAndFlush({ id: list.id, entity: 'list', op: 'delete', payload: {}, clientTimestamp: now })

    showUndo(`"${list.name}" eliminata`, async () => {
      const restoredAt = new Date().toISOString()
      await db.lists.update(list.id, { deletedAt: null, updatedAt: restoredAt })
      await enqueueAndFlush({
        id: list.id,
        entity: 'list',
        op: 'update',
        payload: { deletedAt: null },
        clientTimestamp: restoredAt,
      })
    })
  }

  async function setShoppingAt(list: List, shoppingAt: string | null) {
    setSchedulingList(null)
    const now = new Date().toISOString()
    await db.lists.update(list.id, { shoppingAt, updatedAt: now })
    await enqueueAndFlush({
      id: list.id,
      entity: 'list',
      op: 'update',
      payload: { shoppingAt },
      clientTimestamp: now,
    })
  }

  async function handleLeaveFamily() {
    setConfirmLogout(false)
    if (!session) return

    // Esce da questa famiglia soltanto: le altre restano sul dispositivo, con i
    // loro dati, la loro coda e le loro notifiche
    await unregisterPushForFamily(session)
    removeSession(session.family.id)
    await clearFamilyData(session.family.id)
    closeAblyClient()
    navigate(getSessions().length > 0 ? '/famiglie' : '/')
  }

  async function handleShareInvite() {
    if (!session) return
    if ((await shareInviteCode(session.family)) !== 'copied') return
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  return (
    <main className="lists-page">
      <header className="app-header">
        {/* Sopra le liste c'e l'elenco delle famiglie: da li si passa da una all'altra */}
        <Link to="/famiglie" className="icon-btn" aria-label="Le tue famiglie">
          <IconArrowLeft />
        </Link>
        <div className="app-header-title">
          <h1>{session?.family.name}</h1>
          <div className="invite-row">
            <span className="invite-code">{session?.family.inviteCode}</span>
            <button type="button" className="pill-btn" onClick={handleShareInvite}>
              <IconShare />
              {inviteCopied ? 'Copiato!' : 'Condividi'}
            </button>
          </div>
        </div>
        <ActionMenu
          label="Impostazioni"
          groups={[
            [
              {
                label: pushMenuLabel(),
                icon: <IconBell size={18} />,
                disabled: pushState !== 'on' && pushState !== 'off',
                onSelect: togglePush,
              },
            ],
            [
              {
                label: 'Esci da questa famiglia',
                icon: <IconLogout size={18} />,
                danger: true,
                onSelect: () => setConfirmLogout(true),
              },
            ],
          ]}
        />
      </header>

      {pushError && (
        <div className="activity-notice" role="status">
          {pushError}
        </div>
      )}

      <div className="page-content">
        {lists.length === 0 && (
          <div className="empty-state">
            <IconCart size={40} className="empty-state-icon" />
            <p>Non hai ancora nessuna lista.</p>
            <p className="empty-state-hint">Creane una qui sotto per iniziare!</p>
          </div>
        )}

        <ul className="list-cards">
          {lists.map((list) => {
            const count = counts?.get(list.id)

            return (
            <li key={list.id} className="list-card">
              <Link to={`/liste/${list.id}`} className="list-card-link">
                <span className="list-card-text">
                  <span className="list-card-name">{list.name}</span>
                  {list.shoppingAt && (
                    <span className={isPast(list.shoppingAt) ? 'when past' : 'when'}>
                      <IconCalendar size={13} />
                      {formatWhen(list.shoppingAt)}
                    </span>
                  )}
                </span>
                {/* Quanti articoli restano da prendere, come nelle intestazioni di
                    reparto. Su una lista senza articoli il badge non compare. */}
                {count && count.total > 0 && (
                  <span className={count.remaining === 0 ? 'count-badge done' : 'count-badge'}>
                    {count.remaining}
                  </span>
                )}
                <IconChevronRight className="chevron" />
              </Link>
              <ActionMenu
                label={`Azioni per ${list.name}`}
                triggerClassName="icon-btn-ghost"
                placement="auto"
                groups={[
                  [
                    {
                      label: list.shoppingAt ? 'Cambia quando andare' : 'Quando andare',
                      icon: <IconCalendar size={18} />,
                      onSelect: () => setSchedulingList(list),
                    },
                  ],
                  [
                    {
                      label: 'Elimina lista',
                      icon: <IconTrash size={18} />,
                      danger: true,
                      onSelect: () => deleteList(list),
                    },
                  ],
                ]}
              />
            </li>
            )
          })}
        </ul>
      </div>

      {pending && (
        <Toast
          message={pending.message}
          actionLabel="Annulla"
          onAction={confirmUndo}
          onDismiss={dismiss}
        />
      )}

      <form onSubmit={handleCreateList} className="bottom-bar">
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="Nuova lista, es. Spesa settimanale"
        />
        <button
          type="submit"
          className="fab"
          disabled={!newListName.trim()}
          aria-label="Aggiungi lista"
        >
          <IconPlus />
        </button>
      </form>

      <SchedulePicker
        open={schedulingList !== null}
        listName={schedulingList?.name ?? ''}
        value={schedulingList?.shoppingAt}
        onSave={(iso) => schedulingList && setShoppingAt(schedulingList, iso)}
        onCancel={() => setSchedulingList(null)}
      />

      <ConfirmDialog
        open={confirmLogout}
        title="Uscire dalla famiglia?"
        message={`Uscirai da "${session?.family.name}" su questo dispositivo. Le altre famiglie restano. Potrai rientrare in qualsiasi momento con il codice invito.`}
        confirmLabel="Esci"
        cancelLabel="Annulla"
        danger
        onCancel={() => setConfirmLogout(false)}
        onConfirm={handleLeaveFamily}
      />
    </main>
  )
}

export default Lists
