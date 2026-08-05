import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'
import Families from './routes/Families'
import Lists from './routes/Lists'
import ListView from './routes/ListView'
import SyncManager from './components/SyncManager'
import Welcome from './components/Welcome'
import { useFamilyFromUrl } from './hooks/useFamilyFromUrl'
import { getSession, getSessions } from './lib/auth/session'
import './App.css'

function RequireSession({ children }: { children: React.ReactNode }) {
  // Prima di ogni cosa: una notifica puo chiedere di passare a un'altra famiglia
  useFamilyFromUrl()

  if (!getSession()) return <Navigate to="/" replace />
  return (
    <>
      <SyncManager />
      {children}
    </>
  )
}

function App() {
  const [showWelcome, setShowWelcome] = useState(true)

  if (showWelcome) {
    return <Welcome onFinish={() => setShowWelcome(false)} />
  }

  return (
    <Routes>
      <Route path="/" element={getSession() ? <Navigate to="/liste" replace /> : <Home />} />
      {/* L'elenco delle famiglie ha senso solo se ce n'e almeno una: altrimenti la
          pagina da mostrare e quella per crearne o raggiungerne una */}
      <Route
        path="/famiglie"
        element={getSessions().length > 0 ? <Families /> : <Navigate to="/" replace />}
      />
      <Route
        path="/liste"
        element={
          <RequireSession>
            <Lists />
          </RequireSession>
        }
      />
      <Route
        path="/liste/:listId"
        element={
          <RequireSession>
            <ListView />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
