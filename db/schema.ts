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
    // Per quale shoppingAt e gia partita la notifica: evita di rimandarla a ogni
    // giro dello scheduler, e la riabilita da sola se la data viene spostata
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
    // L'endpoint identifica il singolo dispositivo: e la chiave naturale, il
    // browser ne restituisce uno diverso per ogni installazione
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
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
