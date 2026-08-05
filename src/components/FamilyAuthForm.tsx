import { useState } from 'react'
import { apiFetch, ApiError } from '../lib/api/client'
import { addSession, type Session } from '../lib/auth/session'
import type { Family, Member } from '../lib/types'

type AuthResponse = { token: string; family: Family; member: Member }

type FamilyAuthFormProps = {
  /** Chiamata a famiglia creata o raggiunta: la sessione e gia salvata e attiva. */
  onDone: (session: Session) => void
  /** Chi ha gia una famiglia di solito ne sta cercando un'altra, non creandone una. */
  initialMode?: 'create' | 'join'
}

/**
 * Il modulo per entrare in una famiglia, nuova o esistente. Vive fuori dalle pagine
 * perche serve in due punti: alla prima apertura, quando non c'e niente, e dalla
 * pagina delle famiglie, per aggiungerne una alle altre.
 */
function FamilyAuthForm({ onDone, initialMode = 'create' }: FamilyAuthFormProps) {
  const [mode, setMode] = useState<'create' | 'join'>(initialMode)
  const [familyName, setFamilyName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Senza sessione: creare o unirsi non richiede un token, e mandare quello
      // della famiglia attiva confonderebbe le acque
      const res =
        mode === 'create'
          ? await apiFetch<AuthResponse>(
              '/family-create',
              { method: 'POST', body: JSON.stringify({ familyName, displayName }) },
              null,
            )
          : await apiFetch<AuthResponse>(
              '/family-join',
              { method: 'POST', body: JSON.stringify({ inviteCode, displayName }) },
              null,
            )

      addSession(res)
      onDone(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore imprevisto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="segmented">
        <button
          type="button"
          className={mode === 'create' ? 'active' : ''}
          onClick={() => setMode('create')}
        >
          Crea famiglia
        </button>
        <button
          type="button"
          className={mode === 'join' ? 'active' : ''}
          onClick={() => setMode('join')}
        >
          Unisciti
        </button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {mode === 'create' && (
          <label>
            Nome famiglia
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="es. Famiglia Rossi"
              required
            />
          </label>
        )}
        {mode === 'join' && (
          <label>
            Codice invito
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="es. AB12CD"
              required
            />
          </label>
        )}
        <label>
          Il tuo nome
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="es. Marco"
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {mode === 'create' ? 'Crea famiglia' : 'Unisciti'}
        </button>
      </form>
    </>
  )
}

export default FamilyAuthForm
