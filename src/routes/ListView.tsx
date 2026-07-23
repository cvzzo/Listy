import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/db'
import { enqueueAndFlush } from '../lib/sync/engine'
import { getSession } from '../lib/auth/session'
import { getFrequentItemNames } from '../lib/db/frequentItems'
import type { Category, Item } from '../lib/types'

const UNCATEGORIZED = '__uncategorized__'

function ListView() {
  const { listId } = useParams<{ listId: string }>()
  const session = getSession()
  const [newItemName, setNewItemName] = useState('')
  const [newItemCategoryId, setNewItemCategoryId] = useState<string>(UNCATEGORIZED)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')

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
  }

  const groups = [...categories, null].map((category) => ({
    category,
    items: items
      .filter((item) => (category ? item.categoryId === category.id : item.categoryId === null))
      .sort((a, b) => a.position - b.position),
  }))

  return (
    <main className="list-view">
      <Link to="/liste">← Tutte le liste</Link>

      {items.length === 0 && <p className="empty-state">Nessun articolo. Aggiungine uno qui sotto!</p>}

      {groups.map(
        (group) =>
          group.items.length > 0 && (
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
                    <button type="button" onClick={() => moveCategory(group.category!, -1)} aria-label="Sposta su">
                      ▲
                    </button>
                    <button type="button" onClick={() => moveCategory(group.category!, 1)} aria-label="Sposta giù">
                      ▼
                    </button>
                    <button type="button" onClick={() => deleteCategory(group.category!)} aria-label="Elimina categoria">
                      ×
                    </button>
                  </div>
                </div>
              ) : (
                <h2>Senza categoria</h2>
              )}
              <ul className="items">
                {group.items.map((item) => (
                  <li key={item.id} className={item.checked ? 'checked' : ''}>
                    <label>
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleChecked(item)}
                      />
                      {item.name}
                      {item.quantity ? ` (${item.quantity})` : ''}
                    </label>
                    <span className="added-by">
                      {item.checked ? `✓ ${item.checkedByName}` : `+ ${item.addedByName}`}
                    </span>
                    <button type="button" onClick={() => deleteItem(item)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}

      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              onClick={() => addItemByName(name, newItemCategoryId === UNCATEGORIZED ? null : newItemCategoryId)}
            >
              + {name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleAddItem} className="add-item">
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Aggiungi articolo"
        />
        <select
          value={newItemCategoryId}
          onChange={(e) => setNewItemCategoryId(e.target.value)}
        >
          <option value={UNCATEGORIZED}>Senza categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <button type="submit">Aggiungi</button>
      </form>

      <form onSubmit={handleAddCategory} className="add-category">
        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Nuova categoria"
        />
        <button type="submit">Aggiungi categoria</button>
      </form>
    </main>
  )
}

export default ListView
