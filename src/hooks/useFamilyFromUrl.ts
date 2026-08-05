import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { closeAblyClient } from '../lib/ably/client'
import { getActiveFamilyId, getSessionFor, setActiveFamily } from '../lib/auth/session'
import { syncFamily } from '../lib/sync/engine'

const FAMILY_PARAM = 'famiglia'

/**
 * Le notifiche arrivano da tutte le famiglie del dispositivo e portano la propria
 * nel link. Toccarne una mentre l'app ne sta guardando un'altra deve spostare
 * l'app, non aprire una lista che non appartiene alla famiglia aperta.
 */
export function useFamilyFromUrl() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const familyId = params.get(FAMILY_PARAM)

  useEffect(() => {
    if (!familyId) return

    // Se e gia quella aperta, o e una famiglia che questo dispositivo non conosce
    // piu, non c'e niente da spostare
    if (familyId !== getActiveFamilyId() && getSessionFor(familyId)) {
      setActiveFamily(familyId)
      // Il canale realtime va rifatto sulla famiglia nuova
      closeAblyClient()
      syncFamily(familyId)
    }

    // Il parametro ha esaurito il suo compito: fuori dall'indirizzo, cosi un
    // ricaricamento o un link condiviso non lo si porta dietro
    navigate(location.pathname, { replace: true })
  }, [familyId, location.pathname, navigate])
}
