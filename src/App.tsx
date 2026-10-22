import { Icon, type IconName } from './components/Icon'
import { useRoute } from './lib/router'
import { useToast } from './lib/toast'
import { reloadToUpdate, useUpdateReady } from './lib/update'
import { AnalyzePage } from './pages/AnalyzePage'
import { GamePage } from './pages/GamePage'
import { GamesPage } from './pages/GamesPage'
import { OpeningsPage } from './pages/OpeningsPage'
import { PracticePage } from './pages/PracticePage'
import { PuzzlesPage } from './pages/PuzzlesPage'
import { RepertoirePage } from './pages/RepertoirePage'
import { SettingsPage } from './pages/SettingsPage'

const tabs: { id: string; label: string; icon: IconName }[] = [
  { id: 'analyze', label: 'Analyze', icon: 'board' },
  { id: 'openings', label: 'Openings', icon: 'book' },
  { id: 'practice', label: 'Practice', icon: 'target' },
  { id: 'games', label: 'Games', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export function App() {
  const [route = 'analyze', id, extra] = useRoute()
  const [toast, dismiss] = useToast()
  const updateReady = useUpdateReady()
  // "backup" was the old name of the Settings page.
  const section = route === 'backup' ? 'settings' : route

  let page
  if (section === 'openings' && id) page = <RepertoirePage key={id} id={id} at={extra} />
  else if (section === 'openings') page = <OpeningsPage />
  else if (section === 'practice') page = <PracticePage key={id ?? 'all'} repId={id} />
  else if (section === 'puzzles') page = <PuzzlesPage />
  else if (section === 'games' && id) page = <GamePage key={id} id={id} />
  else if (section === 'games') page = <GamesPage />
  else if (section === 'settings') page = <SettingsPage />
  else page = <AnalyzePage />

  // Puzzles live under the Practice tab.
  const tab = section === 'puzzles' ? 'practice' : tabs.some((t) => t.id === section) ? section : 'analyze'

  return (
    <div className="app">
      {updateReady && (
        <div className="update-bar" role="status">
          <span>Update ready</span>
          <button className="toast-action" onClick={reloadToUpdate}>
            Reload
          </button>
        </div>
      )}
      <main className="main">{page}</main>
      <nav className="tabbar">
        {tabs.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={t.id === tab ? 'active' : ''}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action?.run()
                dismiss()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
