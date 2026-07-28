import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, clearLocalData } from '../lib/db/db'
import { enqueueAndFlush } from '../lib/sync/engine'
import { clearSession, getSession } from '../lib/auth/session'
import { IconCart, IconChevronRight, IconLogout, IconPlus, IconShare, IconTrash } from '../components/icons'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast from '../components/Toast'
import { useUndoToast } from '../hooks/useUndoToast'
import type { List } from '../lib/types'

function Lists() {
  const navigate = useNavigate()
  const session = getSession()
  const [newListName, setNewListName] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
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

  async function handleLogout() {
    setConfirmLogout(false)
    await clearLocalData()
    clearSession()
    navigate('/')
  }

  async function handleShareInvite() {
    if (!session) return
    const text = `Unisciti alla nostra lista della spesa su Listy! Codice invito: ${session.family.inviteCode}`

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Listy', text })
      } catch {
        // condivisione annullata dall'utente, nessuna azione necessaria
      }
      return
    }

    await navigator.clipboard.writeText(text)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

  return (
    <main className="lists-page">
      <header className="app-header">
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
        <button type="button" className="icon-btn" onClick={() => setConfirmLogout(true)} aria-label="Esci">
          <IconLogout />
        </button>
      </header>

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
                <span className="list-card-name">{list.name}</span>
                {/* Quanti articoli restano da prendere, come nelle intestazioni di
                    reparto. Su una lista senza articoli il badge non compare. */}
                {count && count.total > 0 && (
                  <span className={count.remaining === 0 ? 'count-badge done' : 'count-badge'}>
                    {count.remaining}
                  </span>
                )}
                <IconChevronRight className="chevron" />
              </Link>
              <button
                type="button"
                className="icon-btn-ghost danger"
                onClick={() => deleteList(list)}
                aria-label="Elimina lista"
              >
                <IconTrash size={16} />
              </button>
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

      <ConfirmDialog
        open={confirmLogout}
        title="Uscire dalla famiglia?"
        message={`Uscirai da "${session?.family.name}" su questo dispositivo. Potrai rientrare in qualsiasi momento con il codice invito.`}
        confirmLabel="Esci"
        cancelLabel="Annulla"
        danger
        onCancel={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
      />
    </main>
  )
}

export default Lists
