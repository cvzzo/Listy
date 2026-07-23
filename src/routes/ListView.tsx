import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/db'
import { enqueueAndFlush } from '../lib/sync/engine'
import { getSession } from '../lib/auth/session'
import { getFrequentItemNames } from '../lib/db/frequentItems'
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconList,
  IconPencil,
  IconPlus,
  IconTrash,
} from '../components/icons'
import Toast from '../components/Toast'
import { useUndoToast } from '../hooks/useUndoToast'
import type { Category, Item } from '../lib/types'

const UNCATEGORIZED = '__uncategorized__'

function ListView() {
  const { listId } = useParams<{ listId: string }>()
  const session = getSession()
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategoryId, setNewItemCategoryId] = useState<string>(UNCATEGORIZED)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [addingItemCategoryId, setAddingItemCategoryId] = useState<string | null>(null)
  const [newItemInCategory, setNewItemInCategory] = useState('')
  const { pending, showUndo, confirmUndo, dismiss } = useUndoToast()

  const list = useLiveQuery(async () => (listId ? db.lists.get(listId) : undefined), [listId])

  const categories = useLiveQuery(async () => {
    if (!listId) return []
    return db.categories.where('listId').equals(listId).and((c) => !c.deletedAt).sortBy('position')
  }, [listId]) ?? []

  const items = useLiveQuery(async () => {
    if (!listId) return []
    return db.items.where('listId').equals(listId).and((i) => !i.deletedAt).sortBy('position')
  }, [listId]) ?? []

  const frequentNames = useLiveQuery(async () => {
    if (!session) return []
    return getFrequentItemNames(session.family.id)
  }, [session?.family.id]) ?? []

  const currentNames = new Set(items.map((i) => i.name.trim().toLowerCase()))
  const suggestions = frequentNames.filter((name) => !currentNames.has(name.trim().toLowerCase()))

  async function addItemByName(name: string, categoryId: string | null) {
    if (!name || !listId || !session) return

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    await db.items.add({
      id,
      familyId: session.family.id,
      listId,
      categoryId,
      name,
      quantity: null,
      checked: false,
      position: new Date(now).getTime(),
      addedBy: session.member.id,
      addedByName: session.member.displayName,
      checkedBy: null,
      checkedByName: null,
      checkedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await enqueueAndFlush({
      id,
      entity: 'item',
      op: 'create',
      payload: { listId, name, categoryId },
      clientTimestamp: now,
    })
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const name = newItemName.trim()
    if (!name) return
    await addItemByName(name, newItemCategoryId === UNCATEGORIZED ? null : newItemCategoryId)
    setNewItemName('')
  }

  async function handleAddItemToCategory(e: React.FormEvent, categoryId: string) {
    e.preventDefault()
    const name = newItemInCategory.trim()
    if (!name) return
    await addItemByName(name, categoryId)
    setNewItemInCategory('')
    // resta aperto per aggiungere più prodotti di fila alla stessa categoria
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    const name = newCategoryName.trim()
    if (!name || !listId || !session) return

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    await db.categories.add({
      id,
      familyId: session.family.id,
      listId,
      name,
      position: new Date(now).getTime(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await enqueueAndFlush({
      id,
      entity: 'category',
      op: 'create',
      payload: { listId, name },
      clientTimestamp: now,
    })
    setNewCategoryName('')
    setShowAddCategory(false)
  }

  async function renameCategory(category: Category, name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setEditingCategoryId(null)
      return
    }
    const now = new Date().toISOString()
    await db.categories.update(category.id, { name: trimmed, updatedAt: now })
    await enqueueAndFlush({
      id: category.id,
      entity: 'category',
      op: 'update',
      payload: { name: trimmed },
      clientTimestamp: now,
    })
    setEditingCategoryId(null)
  }

  async function deleteCategory(category: Category) {
    const now = new Date().toISOString()
    await db.categories.update(category.id, { deletedAt: now, updatedAt: now })
    await enqueueAndFlush({
      id: category.id,
      entity: 'category',
      op: 'delete',
      payload: {},
      clientTimestamp: now,
    })

    showUndo(`Categoria "${category.name}" eliminata`, async () => {
      const restoredAt = new Date().toISOString()
      await db.categories.update(category.id, { deletedAt: null, updatedAt: restoredAt })
      await enqueueAndFlush({
        id: category.id,
        entity: 'category',
        op: 'update',
        payload: { deletedAt: null },
        clientTimestamp: restoredAt,
      })
    })
  }

  async function moveCategory(category: Category, direction: -1 | 1) {
    const index = categories.findIndex((c) => c.id === category.id)
    const swapWith = categories[index + direction]
    if (!swapWith) return

    const now = new Date().toISOString()
    await db.categories.update(category.id, { position: swapWith.position, updatedAt: now })
    await db.categories.update(swapWith.id, { position: category.position, updatedAt: now })
    await enqueueAndFlush({
      id: category.id,
      entity: 'category',
      op: 'update',
      payload: { position: swapWith.position },
      clientTimestamp: now,
    })
    await enqueueAndFlush({
      id: swapWith.id,
      entity: 'category',
      op: 'update',
      payload: { position: category.position },
      clientTimestamp: now,
    })
  }

  async function toggleChecked(item: Item) {
    if (!session) return
    const checked = !item.checked
    const now = new Date().toISOString()

    await db.items.update(item.id, {
      checked,
      checkedBy: checked ? session.member.id : null,
      checkedByName: checked ? session.member.displayName : null,
      checkedAt: checked ? now : null,
      updatedAt: now,
    })
    await enqueueAndFlush({
      id: item.id,
      entity: 'item',
      op: 'update',
      payload: { checked },
      clientTimestamp: now,
    })
  }

  async function deleteItem(item: Item) {
    const now = new Date().toISOString()
    await db.items.update(item.id, { deletedAt: now, updatedAt: now })
    await enqueueAndFlush({ id: item.id, entity: 'item', op: 'delete', payload: {}, clientTimestamp: now })

    showUndo(`"${item.name}" eliminato`, async () => {
      const restoredAt = new Date().toISOString()
      await db.items.update(item.id, { deletedAt: null, updatedAt: restoredAt })
      await enqueueAndFlush({
        id: item.id,
        entity: 'item',
        op: 'update',
        payload: { deletedAt: null },
        clientTimestamp: restoredAt,
      })
    })
  }

  const categoryIds = new Set(categories.map((c) => c.id))
  const groups = [...categories, null].map((category) => ({
    category,
    items: items
      .filter((item) =>
        category
          ? item.categoryId === category.id
          : // articoli senza categoria o la cui categoria è stata eliminata
            !item.categoryId || !categoryIds.has(item.categoryId),
      )
      .sort((a, b) => a.position - b.position),
  }))

  return (
    <main className="list-view">
      <header className="app-header app-header-compact">
        <Link to="/liste" className="icon-btn" aria-label="Tutte le liste">
          <IconArrowLeft />
        </Link>
        <h1 className="list-title">{list?.name}</h1>
      </header>

      <div className="page-content">
        {items.length === 0 && (
          <div className="empty-state">
            <IconList size={40} className="empty-state-icon" />
            <p>Nessun articolo in questa lista.</p>
            <p className="empty-state-hint">Aggiungine uno qui sotto!</p>
          </div>
        )}

        {groups.map((group) => {
          // La sezione "Senza categoria" compare solo se contiene articoli;
          // le categorie vere restano sempre visibili per poterle gestire.
          if (!group.category && group.items.length === 0) return null

          return (
            <section key={group.category?.id ?? UNCATEGORIZED}>
              {group.category ? (
                <div className="category-header">
                  {editingCategoryId === group.category.id ? (
                    <input
                      autoFocus
                      value={editingCategoryName}
                      onChange={(e) => setEditingCategoryName(e.target.value)}
                      onBlur={() => renameCategory(group.category!, editingCategoryName)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameCategory(group.category!, editingCategoryName)
                        if (e.key === 'Escape') setEditingCategoryId(null)
                      }}
                    />
                  ) : (
                    <h2
                      onClick={() => {
                        setEditingCategoryId(group.category!.id)
                        setEditingCategoryName(group.category!.name)
                      }}
                    >
                      {group.category.name}
                    </h2>
                  )}
                  <div className="category-actions">
                    <button
                      type="button"
                      className="category-add-btn"
                      onClick={() => {
                        setAddingItemCategoryId((prev) =>
                          prev === group.category!.id ? null : group.category!.id,
                        )
                        setNewItemInCategory('')
                      }}
                      aria-label="Aggiungi articolo a questa categoria"
                    >
                      <IconPlus size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategory(group.category!, -1)}
                      aria-label="Sposta su"
                    >
                      <IconChevronUp />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategory(group.category!, 1)}
                      aria-label="Sposta giù"
                    >
                      <IconChevronDown />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(group.category!.id)
                        setEditingCategoryName(group.category!.name)
                      }}
                      aria-label="Rinomina categoria"
                    >
                      <IconPencil />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCategory(group.category!)}
                      aria-label="Elimina categoria"
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <h2 className="section-label">Senza categoria</h2>
              )}
              {group.category && addingItemCategoryId === group.category.id && (
                <form
                  className="add-item-inline"
                  onSubmit={(e) => handleAddItemToCategory(e, group.category!.id)}
                >
                  <input
                    autoFocus
                    value={newItemInCategory}
                    onChange={(e) => setNewItemInCategory(e.target.value)}
                    placeholder={`Aggiungi a ${group.category.name}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setAddingItemCategoryId(null)
                    }}
                  />
                  <button type="submit" className="pill-btn" aria-label="Aggiungi articolo">
                    <IconPlus size={16} />
                  </button>
                </form>
              )}
              {group.items.length > 0 ? (
                <ul className="items">
                  {group.items.map((item) => (
                    <li key={item.id} className={item.checked ? 'checked' : ''}>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleChecked(item)}
                        />
                        <span className="checkmark" aria-hidden="true" />
                        <span className="item-name">
                          {item.name}
                          {item.quantity ? ` (${item.quantity})` : ''}
                        </span>
                      </label>
                      <span className="added-by">
                        {item.checked ? `✓ ${item.checkedByName}` : `+ ${item.addedByName}`}
                      </span>
                      <button
                        type="button"
                        className="icon-btn-ghost"
                        onClick={() => deleteItem(item)}
                        aria-label="Elimina articolo"
                      >
                        <IconTrash size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="category-empty-hint">Nessun articolo in questa categoria</p>
              )}
            </section>
          )
        })}

        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="chip"
                onClick={() =>
                  addItemByName(name, newItemCategoryId === UNCATEGORIZED ? null : newItemCategoryId)
                }
              >
                + {name}
              </button>
            ))}
          </div>
        )}

        {showAddCategory ? (
          <form onSubmit={handleAddCategory} className="add-category-form">
            <input
              autoFocus
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nome categoria"
              onBlur={() => {
                if (!newCategoryName.trim()) setShowAddCategory(false)
              }}
            />
            <button type="submit" className="pill-btn">
              Aggiungi
            </button>
          </form>
        ) : (
          <button type="button" className="add-category-toggle" onClick={() => setShowAddCategory(true)}>
            <IconPlus size={16} /> Nuova categoria
          </button>
        )}
      </div>

      {pending && (
        <Toast
          message={pending.message}
          actionLabel="Annulla"
          onAction={confirmUndo}
          onDismiss={dismiss}
        />
      )}

      <form onSubmit={handleAddItem} className="bottom-bar bottom-bar-item">
        <select value={newItemCategoryId} onChange={(e) => setNewItemCategoryId(e.target.value)}>
          <option value={UNCATEGORIZED}>Senza cat.</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Aggiungi articolo"
        />
        <button type="submit" className="fab" aria-label="Aggiungi articolo">
          <IconPlus />
        </button>
      </form>
    </main>
  )
}

export default ListView
