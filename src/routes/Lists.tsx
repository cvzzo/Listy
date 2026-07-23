import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, clearLocalData } from '../lib/db/db'
import { enqueueAndFlush } from '../lib/sync/engine'
import { clearSession, getSession } from '../lib/auth/session'
import type { List } from '../lib/types'

function Lists() {
  const navigate = useNavigate()
  const session = getSession()
  const [newListName, setNewListName] = useState('')
  const [inviteCopied, setInviteCopied] = useState(false)

  const lists = useLiveQuery(async () => {
    if (!session) return []
    return db.lists
      .where('familyId')
      .equals(session.family.id)
      .and((l) => !l.deletedAt)
      .sortBy('position')
  }, [session?.family.id]) ?? []

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault()
    const name = newListName.trim()
    if (!name || !session) return

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
    setNewListName('')
  }

  async function deleteList(list: List) {
    const now = new Date().toISOString()
    await db.lists.update(list.id, { deletedAt: now, updatedAt: now })
    await enqueueAndFlush({ id: list.id, entity: 'list', op: 'delete', payload: {}, clientTimestamp: now })
  }

  async function handleLogout() {
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
      <header>
        <div>
          <h1>{session?.family.name}</h1>
          <p>
            Codice invito: <strong>{session?.family.inviteCode}</strong>
            <button type="button" className="share-invite" onClick={handleShareInvite}>
              {inviteCopied ? 'Copiato!' : 'Condividi'}
            </button>
          </p>
        </div>
        <button type="button" onClick={handleLogout}>
          Esci
        </button>
      </header>

      {lists.length === 0 && (
        <p className="empty-state">Non hai ancora nessuna lista. Creane una qui sotto!</p>
      )}

      <ul className="list-cards">
        {lists.map((list) => (
          <li key={list.id}>
            <Link to={`/liste/${list.id}`}>{list.name}</Link>
            <button type="button" onClick={() => deleteList(list)} aria-label="Elimina lista">
              ×
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleCreateList}>
        <input
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="Nuova lista, es. Spesa settimanale"
        />
        <button type="submit">Aggiungi lista</button>
      </form>
    </main>
  )
}

export default Lists
