import { db } from './db'

export type ItemMemory = {
  name: string
  /**
   * Il reparto si ricorda per nome, non per id: le categorie appartengono a una
   * singola lista, quindi "Frutta e verdura" nella spesa settimanale e un record
   * diverso da quello nella lista del mare. Il nome invece attraversa le liste.
   */
  categoryName: string | null
  count: number
  lastAddedAt: string
}

/**
 * Tutto cio che la famiglia ha mai aggiunto, raccolto per nome e ordinato per
 * frequenza. Include gli articoli poi eliminati: uno comprato e tolto dalla lista
 * resta un buon suggerimento per la volta dopo.
 */
export async function getItemMemory(familyId: string): Promise<ItemMemory[]> {
  const [familyItems, familyCategories] = await Promise.all([
    db.items.where('familyId').equals(familyId).toArray(),
    db.categories.where('familyId').equals(familyId).toArray(),
  ])

  const nameOfCategory = new Map(familyCategories.map((c) => [c.id, c.name]))

  const memory = new Map<string, ItemMemory>()
  for (const item of familyItems) {
    const key = item.name.trim().toLowerCase()
    if (!key) continue

    const categoryName = item.categoryId ? (nameOfCategory.get(item.categoryId) ?? null) : null
    const existing = memory.get(key)

    if (!existing) {
      memory.set(key, {
        name: item.name.trim(),
        categoryName,
        count: 1,
        lastAddedAt: item.createdAt,
      })
      continue
    }

    existing.count += 1
    // Vince l'aggiunta piu recente: se avete spostato il pane dalla dispensa al
    // panificio, e il panificio quello da riproporre
    if (item.createdAt > existing.lastAddedAt) {
      existing.lastAddedAt = item.createdAt
      existing.name = item.name.trim()
      existing.categoryName = categoryName
    }
  }

  return [...memory.values()].sort(
    (a, b) => b.count - a.count || (a.lastAddedAt < b.lastAddedAt ? 1 : -1),
  )
}
