import { Icon, type IconName } from './components/Icon'
import { useRoute } from './lib/router'
import { useToast } from './lib/toast'
import { AnalyzePage } from './pages/AnalyzePage'
import { OpeningsPage } from './pages/OpeningsPage'
import { RepertoirePage } from './pages/RepertoirePage'
import { SettingsPage } from './pages/SettingsPage'

const tabs: { id: string; label: string; icon: IconName }[] = [
  { id: 'analyze', label: 'Analyze', icon: 'board' },
  { id: 'openings', label: 'Openings', icon: 'book' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export function App() {
  const [route = 'analyze', id] = useRoute()
  const [toast, dismiss] = useToast()
  // "backup" was the old name of the Settings page.
  const section = route === 'backup' ? 'settings' : route

  let page
  if (section === 'openings' && id) page = <RepertoirePage key={id} id={id} />
  else if (section === 'openings') page = <OpeningsPage />
  else if (section === 'settings') page = <SettingsPage />
  else page = <AnalyzePage />

  const tab = tabs.some((t) => t.id === section) ? section : 'analyze'

  return (
    <div className="app">
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
