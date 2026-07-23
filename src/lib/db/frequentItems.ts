import { db } from './db'

export async function getFrequentItemNames(familyId: string, limit = 8): Promise<string[]> {
  // Conta ogni aggiunta storica, incluse quelle poi eliminate dalla lista corrente:
  // un articolo comprato e poi rimosso resta comunque un buon suggerimento futuro.
  const familyItems = await db.items.where('familyId').equals(familyId).toArray()

  const counts = new Map<string, { name: string; count: number; lastAddedAt: string }>()
  for (const item of familyItems) {
    const key = item.name.trim().toLowerCase()
    if (!key) continue
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
      if (item.createdAt > existing.lastAddedAt) existing.lastAddedAt = item.createdAt
    } else {
      counts.set(key, { name: item.name, count: 1, lastAddedAt: item.createdAt })
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || (a.lastAddedAt < b.lastAddedAt ? 1 : -1))
    .slice(0, limit)
    .map((entry) => entry.name)
}
