import type { Item } from '../types'

/**
 * Cosa dire di una modifica arrivata da un altro dispositivo della famiglia.
 * Il tipo di modifica non viaggia sul canale: lo ricaviamo confrontando la riga
 * in arrivo con quella che avevamo, che e l'unico modo per distinguere una
 * spunta da una rinomina senza appesantire il messaggio.
 *
 * Ritorna null quando non c'e niente da annunciare: cambi di posizione, di
 * categoria, o modifiche che non sappiamo raccontare in modo comprensibile.
 */
export function describeItemChange(
  actorName: string,
  local: Item | undefined,
  incoming: Item,
): string | null {
  const name = incoming.name

  if (incoming.deletedAt) {
    return local && !local.deletedAt ? `${actorName} ha eliminato "${name}"` : null
  }

  // Riga mai vista, o che avevamo come eliminata: per chi guarda e una comparsa
  if (!local || local.deletedAt) return `${actorName} ha aggiunto "${name}"`

  if (incoming.checked !== local.checked) {
    return incoming.checked
      ? `${actorName} ha spuntato "${name}"`
      : `${actorName} ha tolto la spunta a "${name}"`
  }

  if (incoming.name !== local.name) {
    return `${actorName} ha rinominato "${local.name}" in "${name}"`
  }

  return null
}
