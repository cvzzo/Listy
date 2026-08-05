import { useNavigate } from 'react-router-dom'
import FamilyAuthForm from '../components/FamilyAuthForm'

/** La prima apertura, quando il dispositivo non conosce ancora nessuna famiglia. */
function Home() {
  const navigate = useNavigate()

  return (
    <main className="home">
      <div className="home-card">
        <img src="/Logo.svg" alt="Listy" className="logo" width={80} height={80} />
        <h1>Listy</h1>
        <p className="subtitle">La lista della spesa condivisa in famiglia.</p>

        <FamilyAuthForm onDone={() => navigate('/liste')} />
      </div>
    </main>
  )
}

export default Home
