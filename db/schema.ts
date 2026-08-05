import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

export const families = pgTable(
  'families',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    inviteCode: text('invite_code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('families_invite_code_idx').on(t.inviteCode)],
)

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('members_family_idx').on(t.familyId)],
)

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    // Quando la famiglia ha deciso di andare a fare questa spesa
    shoppingAt: timestamp('shopping_at', { withTimezone: true }),
    /**
     * Per quale shoppingAt e gia partito ciascun avviso programmato. Tenere il
     * valore invece di un semplice "gia fatto" fa si che spostare la data riarmi
     * gli avvisi da sola, senza codice di reset.
     */
    notifiedDayBeforeFor: timestamp('notified_day_before_for', { withTimezone: true }),
    notifiedDueFor: timestamp('notified_due_for', { withTimezone: true }),
    /** @deprecated sostituita dalle due sopra, da rimuovere con una migrazione a parte */
    notifiedFor: timestamp('notified_for', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => members.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /**
     * Chi l'ha eliminata, per nome come checkedByName sugli articoli. Serve a chi
     * la lista ce l'ha aperta davanti: si vede sparire il pavimento sotto i piedi
     * e la prima cosa che vuole sapere e di chi e stata la mano. Torna a null
     * quando la lista viene riportata indietro.
     */
    deletedByName: text('deleted_by_name'),
  },
  (t) => [index('lists_family_idx').on(t.familyId)],
)

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('categories_family_idx').on(t.familyId),
    index('categories_list_idx').on(t.listId),
  ],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    // L'endpoint identifica il singolo dispositivo: il browser ne restituisce uno
    // diverso per ogni installazione. Da solo pero non basta come chiave: lo stesso
    // dispositivo puo stare in piu famiglie e va avvisato per ognuna
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Una riga per dispositivo e per famiglia: e questa coppia a essere unica
    uniqueIndex('push_subscriptions_endpoint_family_idx').on(t.endpoint, t.familyId),
    index('push_subscriptions_family_idx').on(t.familyId),
  ],
)

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    quantity: text('quantity'),
    checked: boolean('checked').notNull().default(false),
    position: integer('position').notNull().default(0),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => members.id),
    addedByName: text('added_by_name').notNull(),
    checkedBy: uuid('checked_by').references(() => members.id),
    checkedByName: text('checked_by_name'),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('items_family_sync_idx').on(t.familyId, t.updatedAt),
    index('items_list_idx').on(t.listId),
  ],
)
