import Home from './pages/Home'
import Game from './pages/Game'
import { useClientStore } from './store/useClientStore'
import { useHostStore } from './store/useHostStore'

export default function App() {
  const hostPhase = useHostStore(s => s.phase)
  const isHost = useHostStore(s => s.isHost)
  const isClient = useClientStore(s => s.connected)

  if (isHost && hostPhase !== 'idle') {
    return <Game isHost={true} />
  }

  if (isClient) {
    return <Game isHost={false} />
  }

  return <Home />
}
