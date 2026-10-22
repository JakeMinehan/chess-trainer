import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'chessground/assets/chessground.base.css'
import './pieces.css'
import './styles.css'
import './lib/install'
import './lib/prefs'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
