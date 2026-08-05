import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch, ApiError } from '../lib/api/client'
import { getSessionFor, setActiveFamily } from '../lib/auth/session'
import { closeAblyClient } from '../lib/ably/client'
import { joinFamily } from '../lib/invite/join'
import { registerPushForAllFamilies } from '../lib/push/push'
import { syncFamily } from '../lib/sync/engine'
import ConfirmDialog from '../components/ConfirmDialog'

type InvitedFamily = { id: string; name: string }

/**
 * Il capolinea di un link d'invito. Chi arriva qui non ha una sessione e spesso
 * nemmeno sa cosa sia Listy: la sola cosa che gli si chiede e come si chiama, il
 * codice ce l'ha gia il link.
 */
function Invite() {
  const { code = '' } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const [family, setFamily] = useState<InvitedFamily | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unknown'>('loading')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [nameTaken, setNameTaken] = useState(false)
  const [joining, setJoining] = useState(false)
  const nameInput = useRef<HTMLInputElement>(null)

  // Prima di chiedere il nome bisogna poter dire dove si sta entrando: il codice
  // da solo non lo racconta a nessuno
  useEffect(() => {
    let cancelled = false
    apiFetch<{ family: InvitedFamily }>(
      `/family-preview?code=${encodeURIComponent(code)}`,
      {},
      null,
    )
      .then((res) => {
        if (cancelled) return
        setFamily(res.family)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('unknown')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  // Lo stesso link puo arrivare a chi in quella famiglia c'e gia: allora non e un
  // invito, e una scorciatoia
  const existing = family ? getSessionFor(family.id) : null

  function openExisting(familyId: string) {
    setActiveFamily(familyId)
    closeAblyClient()
    syncFamily(familyId)
    navigate('/liste')
  }

  async function attemptJoin(claimExisting: boolean) {
    const name = displayName.trim()
    if (!name) return

    setError(null)
    setHint(null)
    setJoining(true)
    try {
      const result = await joinFamily(code, name, claimExisting)
      if (result.status === 'name_taken') {
        setNameTaken(true)
        return
      }

      // La famiglia e cambiata: canale realtime da rifare e notifiche da estendere
      closeAblyClient()
      registerPushForAllFamilies()
      navigate('/liste')
    } catch (err) {
      setError(
        err instanceof ApiError && err.statusCode === 404
          ? 'Questo invito non e piu valido'
          : 'Non sono riuscito a farti entrare, riprova',
      )
    } finally {
      setJoining(false)
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
    <main className="home">
      {/* Dietro la modale non c'e una pagina da cui si arriva: ci si mette almeno
          di cosa si sta parlando, invece di uno schermo scuro e basta */}
      <div className="home-card invite-backdrop">
        <img src="/Logo.svg" alt="Listy" className="logo" width={80} height={80} />
        <h1>Listy</h1>
        <p className="subtitle">La lista della spesa condivisa in famiglia.</p>
      </div>

      <div className="modal-overlay">
        <div className="modal-card" role="dialog" aria-modal="true" aria-label="Invito">
          {status === 'loading' && <p className="invite-loading">Sto aprendo l'invito…</p>}

          {status === 'unknown' && (
            <>
              <h2>Invito non valido</h2>
              <p>
                Il codice di questo link non corrisponde a nessuna famiglia. Fattene mandare uno
                nuovo da chi ti ha invitato.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-primary" onClick={() => navigate('/')}>
                  Vai a Listy
                </button>
              </div>
            </>
          )}

          {status === 'ready' && family && existing && (
            <>
              <h2>Ci sei già</h2>
              <p>
                Su questo dispositivo fai già parte di "{family.name}", come{' '}
                {existing.member.displayName}.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => openExisting(family.id)}
                >
                  Apri le liste
                </button>
              </div>
            </>
          )}

          {status === 'ready' && family && !existing && (
            <>
              <h2>Sei stato invitato</h2>
              <p>
                Entri nella famiglia "{family.name}" e da qui in poi la lista della spesa è anche
                tua: quello che aggiungi lo vedono tutti, subito.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  attemptJoin(false)
                }}
              >
                <label className="modal-field">
                  Come ti chiami?
                  <input
                    ref={nameInput}
                    autoFocus
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="es. Marco"
                    // Il nome finisce accanto a ogni articolo che aggiungi: e cosi
                    // che gli altri sanno chi ha messo cosa
                    autoComplete="given-name"
                    required
                  />
                </label>

                {hint && <p className="invite-hint">{hint}</p>}
                {error && <p className="error invite-error">{error}</p>}

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => navigate('/')}>
                    Non ora
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={joining || !displayName.trim()}
                  >
                    {joining ? 'Un attimo…' : 'Entra'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={nameTaken}
        title="Questo nome è già in uso"
        message={`In "${family?.name}" c'è già qualcuno che si chiama ${displayName.trim()}. Sei tu, che entri da un altro dispositivo?`}
        confirmLabel="Sì, sono io"
        cancelLabel="No, cambio nome"
        onCancel={pickAnotherName}
        onConfirm={() => {
          setNameTaken(false)
          attemptJoin(true)
        }}
      />
    </main>
  )
}

export default Invite
