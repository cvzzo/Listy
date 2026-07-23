import { Navigate, Route, Routes } from 'react-router-dom'
import Home from './routes/Home'
import Lists from './routes/Lists'
import ListView from './routes/ListView'
import SyncManager from './components/SyncManager'
import { getSession } from './lib/auth/session'
import './App.css'

function RequireSession({ children }: { children: React.ReactNode }) {
  if (!getSession()) return <Navigate to="/" replace />
  return (
    <>
      <SyncManager />
      {children}
    </>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={getSession() ? <Navigate to="/liste" replace /> : <Home />} />
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
    </Routes>
  )
}

export default App
