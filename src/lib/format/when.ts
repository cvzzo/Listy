const time = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
const dayAndMonth = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * "oggi alle 18:00" si legge molto piu in fretta di "lun 28 lug alle 18:00", e
 * quando si va a fare la spesa e quasi sempre entro un paio di giorni.
 */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000)
  const at = time.format(d)

  if (days === 0) return `oggi alle ${at}`
  if (days === 1) return `domani alle ${at}`
  if (days === -1) return `ieri alle ${at}`
  return `${dayAndMonth.format(d)} alle ${at}`
}

export function isPast(iso: string): boolean {
  const d = new Date(iso)
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now()
}

/** Da ISO al formato che vuole <input type="datetime-local">, in ora locale. */
export function toInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** E ritorno: il valore del campo e ora locale, il database vuole ISO. */
export function fromInputValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
