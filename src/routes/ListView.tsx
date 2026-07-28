import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db/db'
import { getSession } from '../lib/auth/session'
import { getItemMemory } from '../lib/db/frequentItems'
import {
  applyChanges,
  restoreChange,
  softDeleteChange,
  type Change,
} from '../lib/history/changes'
import {
  IconArrowLeft,
  IconCheckSquare,
  IconChevronDown,
  IconChevronUp,
  IconList,
  IconPencil,
  IconPlus,
  IconRedo,
  IconSparkle,
  IconSquare,
  IconTag,
  IconTrash,
  IconUndo,
} from '../components/icons'
import ActionMenu from '../components/ActionMenu'
import Toast from '../components/Toast'
import { useActionHistory } from '../hooks/useActionHistory'
import { useCollapsedCategories } from '../hooks/useCollapsedCategories'
import { useDismissOnOutside } from '../hooks/useDismissOnOutside'
import { useUndoToast } from '../hooks/useUndoToast'
import type { Category, Item } from '../lib/types'

const UNCATEGORIZED = '__uncategorized__'

function ListView() {
  const { listId } = useParams<{ listId: string }>()
  const session = getSession()
  const [newItemName, setNewItemName] = useState('')
  const [pinnedCategoryId, setPinnedCategoryId] = useState<string | null>(null)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItemName, setEditingItemName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const [addingItemCategoryId, setAddingItemCategoryId] = useState<string | null>(null)
  const [newItemInCategory, setNewItemInCategory] = useState('')
  const { pending, showUndo, confirmUndo, dismiss } = useUndoToast()
  const { isCollapsed, toggle: toggleCollapsed, expand } = useCollapsedCategories()
  const { record, undo, redo, undoLabel, redoLabel } = useActionHistory()

  // Il modulo di aggiunta dentro una categoria resta aperto per infilare piu articoli
  // di fila, e si chiude appena tocchi altrove: "ho finito" e un tocco fuori
  const inlineAddRef = useRef<HTMLFormElement>(null)
  useDismissOnOutside(
    inlineAddRef,
    () => setAddingItemCategoryId(null),
    addingItemCategoryId !== null,
    '.category-add-btn',
  )

  const list = useLiveQuery(async () => (listId ? db.lists.get(listId) : undefined), [listId])

  const categories = useLiveQuery(async () => {
    if (!listId) return []
    return db.categories.where('listId').equals(listId).and((c) => !c.deletedAt).sortBy('position')
  }, [listId]) ?? []

  const items = useLiveQuery(async () => {
    if (!listId) return []
    return db.items.where('listId').equals(listId).and((i) => !i.deletedAt).sortBy('position')
  }, [listId]) ?? []

  const memory = useLiveQuery(async () => {
    if (!session) return []
    return getItemMemory(session.family.id)
  }, [session?.family.id]) ?? []

  const checkedItems = items.filter((item) => item.checked)

  const currentNames = new Set(items.map((i) => i.name.trim().toLowerCase()))
  const notYetInList = memory.filter((m) => !currentNames.has(m.name.toLowerCase()))
  const suggestions = notYetInList.slice(0, 8)

  // Il reparto ricordato e un nome: qui torna a essere la categoria di questa lista,
  // se esiste. Aggiungere "Mele" in una lista senza "Frutta e verdura" non inventa
  // il reparto, lascia semplicemente l'articolo senza categoria.
  const categoryIdByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]))

  function rememberedCategoryId(name: string): string | null {
    const entry = memory.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())
    if (!entry?.categoryName) return null
    return categoryIdByName.get(entry.categoryName.trim().toLowerCase()) ?? null
  }

  // pinnedCategoryId null = automatico, cioe deciso da cio che si sta scrivendo
  const targetCategoryId =
    pinnedCategoryId === null
      ? rememberedCategoryId(newItemName)
      : pinnedCategoryId === UNCATEGORIZED
        ? null
        : pinnedCategoryId

  const targetCategoryName =
    categories.find((c) => c.id === targetCategoryId)?.name ?? 'Senza categoria'
  // Abbreviato solo a schermo: nella pastiglia "Senza categoria" verrebbe troncato
  const targetChipLabel = targetCategoryId ? targetCategoryName : 'Senza cat.'

  const typed = newItemName.trim().toLowerCase()
  const completions = !typed
    ? []
    : notYetInList
        .filter((m) => m.name.toLowerCase().includes(typed))
        // Chi comincia col testo digitato viene prima; dentro ogni gruppo resta
        // l'ordine per frequenza che memory ha gia
        .sort(
          (a, b) =>
            Number(b.name.toLowerCase().startsWith(typed)) -
            Number(a.name.toLowerCase().startsWith(typed)),
        )
        .slice(0, 4)

  /**
   * Ogni azione della lista passa di qui: applica le modifiche e le consegna alla
   * cronologia, cosi il menu in alto puo sempre tornare indietro e rifarle.
   * Il toast serve solo dove l'azione fa sparire qualcosa: spuntare un articolo
   * lo si fa cinquanta volte per spesa, e cinquanta toast sono un fastidio.
   */
  async function perform(label: string, forward: Change[], backward: Change[], toast = false) {
    if (forward.length === 0) return
    dismiss()
    await applyChanges(forward)
    record({ label, forward, backward })
    if (toast) showUndo(label, undo)
  }

  const upd = (
    entity: 'item' | 'category',
    id: string,
    local: Record<string, unknown>,
    payload: Record<string, unknown>,
  ): Change => ({ kind: 'update', entity, id, op: 'update', local, payload })

  async function addItemByName(name: string, categoryId: string | null) {
    if (!name || !listId || !session) return

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row: Item = {
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
    }

    await perform(
      `Aggiunto "${name}"`,
      [{ kind: 'create', entity: 'item', id, row, payload: { listId, name, categoryId } }],
      [softDeleteChange('item', id)],
    )
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()
    const name = newItemName.trim()
    if (!name) return
    // Svuota prima delle scritture, altrimenti chi incalza col prossimo articolo
    // se lo vede cancellare quando lo svuotamento arriva in ritardo
    setNewItemName('')
    await addItemByName(name, targetCategoryId)
  }

  async function handleAddItemToCategory(e: React.FormEvent, categoryId: string) {
    e.preventDefault()
    const name = newItemInCategory.trim()
    if (!name) return
    // resta aperto per aggiungere più prodotti di fila alla stessa categoria
    setNewItemInCategory('')
    await addItemByName(name, categoryId)
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault()
    const name = newCategoryName.trim()
    if (!name || !listId || !session) return

    setNewCategoryName('')
    setShowAddCategory(false)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row: Category = {
      id,
      familyId: session.family.id,
      listId,
      name,
      position: new Date(now).getTime(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }

    await perform(
      `Aggiunta categoria "${name}"`,
      [{ kind: 'create', entity: 'category', id, row, payload: { listId, name } }],
      [softDeleteChange('category', id)],
    )
  }

  async function renameCategory(category: Category, name: string) {
    const trimmed = name.trim()
    setEditingCategoryId(null)
    if (!trimmed || trimmed === category.name) return

    await perform(
      `Categoria rinominata in "${trimmed}"`,
      [upd('category', category.id, { name: trimmed }, { name: trimmed })],
      [upd('category', category.id, { name: category.name }, { name: category.name })],
    )
  }

  async function deleteEntities(
    entity: 'item' | 'category',
    targets: { id: string }[],
    label: string,
  ) {
    await perform(
      label,
      targets.map((t) => softDeleteChange(entity, t.id)),
      targets.map((t) => restoreChange(entity, t.id)),
      true,
    )
  }

  async function deleteCategory(category: Category) {
    await deleteEntities('category', [category], `Eliminata categoria "${category.name}"`)
  }

  async function deleteAllCategories() {
    await deleteEntities(
      'category',
      categories,
      categories.length === 1 ? 'Eliminata 1 categoria' : `Eliminate ${categories.length} categorie`,
    )
  }

  async function moveCategory(category: Category, direction: -1 | 1) {
    const index = categories.findIndex((c) => c.id === category.id)
    const swapWith = categories[index + direction]
    if (!swapWith) return

    const at = (id: string, position: number) => upd('category', id, { position }, { position })

    await perform(
      `Spostata categoria "${category.name}"`,
      [at(category.id, swapWith.position), at(swapWith.id, category.position)],
      [at(category.id, category.position), at(swapWith.id, swapWith.position)],
    )
  }

  // Chi ha spuntato viene ricalcolato dal server su chi manda la modifica: in locale
  // ripristiniamo l'autore originale, dopo il sync il nome mostrato puo cambiare
  const checkState = (item: Pick<Item, 'checked' | 'checkedBy' | 'checkedByName' | 'checkedAt'>) => ({
    checked: item.checked,
    checkedBy: item.checkedBy,
    checkedByName: item.checkedByName,
    checkedAt: item.checkedAt,
  })

  async function toggleChecked(item: Item) {
    if (!session) return
    const checked = !item.checked
    const now = new Date().toISOString()

    const next = checked
      ? {
          checked: true,
          checkedBy: session.member.id,
          checkedByName: session.member.displayName,
          checkedAt: now,
        }
      : { checked: false, checkedBy: null, checkedByName: null, checkedAt: null }

    await perform(
      checked ? `Spuntato "${item.name}"` : `Tolta la spunta a "${item.name}"`,
      [upd('item', item.id, next, { checked })],
      [upd('item', item.id, checkState(item), { checked: item.checked })],
    )
  }

  async function renameItem(item: Item, name: string) {
    const trimmed = name.trim()
    setEditingItemId(null)
    if (!trimmed || trimmed === item.name) return

    await perform(
      `Rinominato "${item.name}" in "${trimmed}"`,
      [upd('item', item.id, { name: trimmed }, { name: trimmed })],
      [upd('item', item.id, { name: item.name }, { name: item.name })],
    )
  }

  async function moveItemToCategory(item: Item, categoryId: string | null) {
    await perform(
      `Spostato "${item.name}"`,
      [upd('item', item.id, { categoryId }, { categoryId })],
      [upd('item', item.id, { categoryId: item.categoryId }, { categoryId: item.categoryId })],
    )
  }

  async function deleteItem(item: Item) {
    await deleteEntities('item', [item], `Eliminato "${item.name}"`)
  }

  async function deleteCheckedItems() {
    await deleteEntities(
      'item',
      checkedItems,
      checkedItems.length === 1
        ? 'Eliminato 1 articolo spuntato'
        : `Eliminati ${checkedItems.length} articoli spuntati`,
    )
  }

  async function clearList() {
    await deleteEntities(
      'item',
      items,
      items.length === 1 ? 'Eliminato 1 articolo' : `Eliminati ${items.length} articoli`,
    )
  }

  async function uncheckAllItems() {
    const cleared = { checked: false, checkedBy: null, checkedByName: null, checkedAt: null }

    await perform(
      checkedItems.length === 1 ? 'Rimossa 1 spunta' : `Rimosse ${checkedItems.length} spunte`,
      checkedItems.map((i) => upd('item', i.id, cleared, { checked: false })),
      checkedItems.map((i) => upd('item', i.id, checkState(i), { checked: true })),
      true,
    )
  }

  const categoryIds = new Set(categories.map((c) => c.id))
  const byPosition = (a: Item, b: Item) => a.position - b.position

  const groups = [...categories, null].map((category) => {
    const groupItems = items.filter((item) =>
      category
        ? item.categoryId === category.id
        : // articoli senza categoria o la cui categoria è stata eliminata
          !item.categoryId || !categoryIds.has(item.categoryId),
    )

    // Quello che manca resta in cima al reparto, lo spuntato scivola sotto:
    // durante la spesa la parte utile della lista sta sempre in alto
    return {
      category,
      items: [
        ...groupItems.filter((i) => !i.checked).sort(byPosition),
        ...groupItems.filter((i) => i.checked).sort(byPosition),
      ],
    }
  })

  // Le categorie che contengono articoli hanno la priorità e restano in alto,
  // ciascun blocco mantiene al suo interno l'ordine per "position".
  const orderedGroups = [
    ...groups.filter((g) => g.items.length > 0),
    ...groups.filter((g) => g.items.length === 0),
  ]

  return (
    <main className="list-view">
      <header className="app-header app-header-compact">
        <Link to="/liste" className="icon-btn" aria-label="Tutte le liste">
          <IconArrowLeft />
        </Link>
        <h1 className="list-title">{list?.name}</h1>
        <ActionMenu
          label="Azioni lista"
          groups={[
            [
              {
                label: undoLabel ? `Annulla: ${undoLabel}` : 'Niente da annullare',
                icon: <IconUndo size={18} />,
                disabled: !undoLabel,
                onSelect: undo,
              },
              {
                label: redoLabel ? `Ripeti: ${redoLabel}` : 'Niente da ripetere',
                icon: <IconRedo size={18} />,
                disabled: !redoLabel,
                onSelect: redo,
              },
            ],
            [
              {
                label: 'Togli tutte le spunte',
                icon: <IconSquare />,
                disabled: checkedItems.length === 0,
                onSelect: uncheckAllItems,
              },
              {
                label: 'Elimina articoli spuntati',
                icon: <IconCheckSquare />,
                disabled: checkedItems.length === 0,
                danger: true,
                onSelect: deleteCheckedItems,
              },
              {
                label: 'Svuota la lista',
                icon: <IconTrash />,
                disabled: items.length === 0,
                danger: true,
                onSelect: clearList,
              },
            ],
            [
              {
                label: 'Elimina tutte le categorie',
                icon: <IconTag />,
                disabled: categories.length === 0,
                danger: true,
                onSelect: deleteAllCategories,
              },
            ],
          ]}
        />
      </header>

      <div className="page-content">
        {items.length === 0 && (
          <div className="empty-state">
            <IconList size={40} className="empty-state-icon" />
            <p>Nessun articolo in questa lista.</p>
            <p className="empty-state-hint">Aggiungine uno qui sotto!</p>
          </div>
        )}

        {orderedGroups.map((group) => {
          // La sezione "Senza categoria" compare solo se contiene articoli;
          // le categorie vere restano sempre visibili per poterle gestire.
          if (!group.category && group.items.length === 0) return null

          // orderedGroups puo differire da categories: per abilitare "sposta su/giu"
          // conta la posizione reale, non quella a schermo
          const categoryIndex = group.category
            ? categories.findIndex((c) => c.id === group.category!.id)
            : -1

          // La sezione senza categoria non ha un id proprio: la chiave la lega alla lista
          const collapseKey = group.category ? group.category.id : `${listId}:${UNCATEGORIZED}`
          const collapsed = isCollapsed(collapseKey)
          const remaining = group.items.filter((i) => !i.checked).length

          const caret = (
            <button
              type="button"
              className={group.category ? 'category-toggle' : 'category-toggle muted'}
              aria-expanded={!collapsed}
              onClick={() => toggleCollapsed(collapseKey)}
            >
              <IconChevronDown size={16} className="category-caret" />
              {group.category ? (
                <h2>{group.category.name}</h2>
              ) : (
                <h2 className="section-label">Senza categoria</h2>
              )}
              {/* Il conteggio di cio che manca resta visibile anche a reparto aperto;
                  sparisce solo dove non c'e proprio niente, che gia lo dice da se */}
              {group.items.length > 0 && (
                <span className={remaining === 0 ? 'count-badge done' : 'count-badge'}>
                  {remaining}
                </span>
              )}
            </button>
          )

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
                    caret
                  )}
                  <div className="category-actions">
                    <button
                      type="button"
                      className="icon-btn-plain category-add-btn"
                      onClick={() => {
                        // Aggiungere a un reparto chiuso lo riapre, altrimenti si
                        // scriverebbe dentro qualcosa che non si vede
                        expand(collapseKey)
                        // Non e piu un interruttore: a chiudere ci pensa il tocco fuori
                        setAddingItemCategoryId(group.category!.id)
                        setNewItemInCategory('')
                      }}
                      aria-label={`Aggiungi articolo a ${group.category.name}`}
                    >
                      <IconPlus size={20} />
                    </button>
                    <ActionMenu
                      label={`Azioni categoria ${group.category.name}`}
                      triggerClassName="icon-btn-plain"
                      groups={[
                        [
                          {
                            label: 'Rinomina',
                            icon: <IconPencil size={18} />,
                            onSelect: () => {
                              setEditingCategoryId(group.category!.id)
                              setEditingCategoryName(group.category!.name)
                            },
                          },
                          {
                            label: 'Sposta su',
                            icon: <IconChevronUp size={18} />,
                            disabled: categoryIndex <= 0,
                            onSelect: () => moveCategory(group.category!, -1),
                          },
                          {
                            label: 'Sposta giù',
                            icon: <IconChevronDown size={18} />,
                            disabled: categoryIndex === categories.length - 1,
                            onSelect: () => moveCategory(group.category!, 1),
                          },
                        ],
                        [
                          {
                            label: 'Elimina categoria',
                            icon: <IconTrash size={18} />,
                            danger: true,
                            onSelect: () => deleteCategory(group.category!),
                          },
                        ],
                      ]}
                    />
                  </div>
                </div>
              ) : (
                <div className="category-header">{caret}</div>
              )}
              {!collapsed && group.category && addingItemCategoryId === group.category.id && (
                <form
                  ref={inlineAddRef}
                  className="add-item-inline"
                  onSubmit={(e) => handleAddItemToCategory(e, group.category!.id)}
                >
                  <input
                    autoFocus
                    value={newItemInCategory}
                    onChange={(e) => setNewItemInCategory(e.target.value)}
                    placeholder={`Aggiungi a ${group.category.name}`}
                  />
                  <button
                    type="submit"
                    className="pill-btn"
                    disabled={!newItemInCategory.trim()}
                    aria-label="Aggiungi articolo"
                  >
                    <IconPlus size={16} />
                  </button>
                </form>
              )}
              {collapsed ? null : group.items.length > 0 ? (
                <ul className="items">
                  {group.items.map((item) => {
                    // Una categoria eliminata vale come nessuna: e cosi che la riga
                    // e gia raggruppata, e cosi deve leggerla anche il menu
                    const itemCategoryId =
                      item.categoryId && categoryIds.has(item.categoryId) ? item.categoryId : null

                    return (
                      <li key={item.id} className={item.checked ? 'checked' : ''}>
                        {editingItemId === item.id ? (
                          <input
                            className="item-edit"
                            autoFocus
                            value={editingItemName}
                            onChange={(e) => setEditingItemName(e.target.value)}
                            onBlur={() => renameItem(item, editingItemName)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameItem(item, editingItemName)
                              if (e.key === 'Escape') setEditingItemId(null)
                            }}
                          />
                        ) : (
                          <>
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
                            <ActionMenu
                              label={`Azioni per ${item.name}`}
                              triggerClassName="icon-btn-ghost"
                              placement="auto"
                              groups={[
                                [
                                  {
                                    label: 'Rinomina',
                                    icon: <IconPencil size={18} />,
                                    onSelect: () => {
                                      setEditingItemId(item.id)
                                      setEditingItemName(item.name)
                                    },
                                  },
                                ],
                                // Solo le destinazioni diverse da quella attuale
                                [
                                  ...(itemCategoryId !== null
                                    ? [
                                        {
                                          label: 'Sposta senza categoria',
                                          icon: <IconTag size={18} />,
                                          onSelect: () => moveItemToCategory(item, null),
                                        },
                                      ]
                                    : []),
                                  ...categories
                                    .filter((c) => c.id !== itemCategoryId)
                                    .map((category) => ({
                                      label: `Sposta in ${category.name}`,
                                      icon: <IconTag size={18} />,
                                      onSelect: () => moveItemToCategory(item, category.id),
                                    })),
                                ],
                                [
                                  {
                                    label: 'Elimina articolo',
                                    icon: <IconTrash size={18} />,
                                    danger: true,
                                    onSelect: () => deleteItem(item),
                                  },
                                ],
                              ].filter((g) => g.length > 0)}
                            />
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="category-empty-hint">Nessun articolo in questa categoria</p>
              )}
            </section>
          )
        })}

        {suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className="chip"
                onClick={() => addItemByName(entry.name, rememberedCategoryId(entry.name))}
              >
                + {entry.name}
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

      {completions.length > 0 && (
        <ul className="completions">
          {completions.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                onClick={() => {
                  setNewItemName('')
                  addItemByName(entry.name, rememberedCategoryId(entry.name))
                }}
              >
                <span className="completion-name">{entry.name}</span>
                {entry.categoryName && (
                  <span className="completion-category">{entry.categoryName}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAddItem} className="bottom-bar bottom-bar-item">
        <ActionMenu
          label={`Reparto di destinazione: ${targetCategoryName}`}
          triggerClassName={pinnedCategoryId === null ? 'target-chip' : 'target-chip pinned'}
          placement="top-left"
          triggerContent={<span>{targetChipLabel}</span>}
          groups={[
            [
              // Nessuna voce e disabilitata: qual e la destinazione corrente lo dice
              // la pastiglia qui sotto, e "grigio" leggerebbe come "non disponibile"
              {
                label: 'Automatico',
                icon: <IconSparkle size={18} />,
                onSelect: () => setPinnedCategoryId(null),
              },
              {
                label: 'Senza categoria',
                icon: <IconTag size={18} />,
                onSelect: () => setPinnedCategoryId(UNCATEGORIZED),
              },
            ],
            // Senza categorie il secondo gruppo resterebbe una riga di separazione vuota
            ...(categories.length > 0
              ? [
                  categories.map((category) => ({
                    label: category.name,
                    icon: <IconTag size={18} />,
                    onSelect: () => setPinnedCategoryId(category.id),
                  })),
                ]
              : []),
          ]}
        />
        <input
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Aggiungi articolo"
        />
        <button
          type="submit"
          className="fab"
          disabled={!newItemName.trim()}
          aria-label="Aggiungi articolo"
        >
          <IconPlus />
        </button>
      </form>
    </main>
  )
}

export default ListView
