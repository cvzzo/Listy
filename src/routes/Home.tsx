import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api/client'
import { setSession } from '../lib/auth/session'
import type { Family, Member } from '../lib/types'

type AuthResponse = { token: string; family: Family; member: Member }

function Home() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'create' | 'join'>('create')
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
      const res =
        mode === 'create'
          ? await apiFetch<AuthResponse>('/family-create', {
              method: 'POST',
              body: JSON.stringify({ familyName, displayName }),
            })
          : await apiFetch<AuthResponse>('/family-join', {
              method: 'POST',
              body: JSON.stringify({ inviteCode, displayName }),
            })

      setSession(res)
      navigate('/liste')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Errore imprevisto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="home">
      <img src="/Logo.svg" alt="Listy" className="logo" width={96} height={96} />
      <h1>Listy</h1>
      <p>La lista della spesa condivisa in famiglia.</p>

      <div className="tabs">
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

      <form onSubmit={handleSubmit}>
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

        <button type="submit" disabled={loading}>
          {mode === 'create' ? 'Crea famiglia' : 'Unisciti'}
        </button>
      </form>
    </main>
  )
}

export default Home
