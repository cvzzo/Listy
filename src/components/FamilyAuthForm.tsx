import { useRef, useState } from 'react'
import { apiFetch, ApiError } from '../lib/api/client'
import { addSession, type Session } from '../lib/auth/session'
import { joinFamily } from '../lib/invite/join'
import ConfirmDialog from './ConfirmDialog'
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
  const [hint, setHint] = useState<string | null>(null)
  const [nameTaken, setNameTaken] = useState(false)
  const [loading, setLoading] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  async function attempt(claimExisting: boolean) {
    setError(null)
    setHint(null)
    setLoading(true)
    try {
      if (mode === 'create') {
        // Senza sessione: creare una famiglia non richiede un token, e mandare
        // quello della famiglia attiva confonderebbe le acque
        const res = await apiFetch<AuthResponse>(
          '/family-create',
          { method: 'POST', body: JSON.stringify({ familyName, displayName }) },
          null,
        )
        addSession(res)
        onDone(res)
        return
      }

      const result = await joinFamily(inviteCode, displayName.trim(), claimExisting)
      // Quel nome e gia di qualcuno: prima di prenderselo va chiesto
      if (result.status === 'name_taken') setNameTaken(true)
      else onDone(result.session)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore imprevisto')
    } finally {
      setLoading(false)
    }
  }

  /** Non era lui: si torna al campo, che e li che va risolta la cosa. */
  function pickAnotherName() {
    setNameTaken(false)
    setHint('Scegli un nome diverso, così gli altri vi riconoscono.')
    nameInput.current?.focus()
    nameInput.current?.select()
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          attempt(false)
        }}
        className="auth-form"
      >
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
            ref={nameInput}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="es. Marco"
            required
          />
        </label>

        {hint && <p className="invite-hint">{hint}</p>}
        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={loading}>
          {mode === 'create' ? 'Crea famiglia' : 'Unisciti'}
        </button>
      </form>

      <ConfirmDialog
        open={nameTaken}
        title="Questo nome è già in uso"
        message={`In questa famiglia c'è già qualcuno che si chiama ${displayName.trim()}. Sei tu, che entri da un altro dispositivo?`}
        confirmLabel="Sì, sono io"
        cancelLabel="No, cambio nome"
        onCancel={pickAnotherName}
        onConfirm={() => {
          setNameTaken(false)
          attempt(true)
        }}
      />
    </>
  )
}

export default FamilyAuthForm
