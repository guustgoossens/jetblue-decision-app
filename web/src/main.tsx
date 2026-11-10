import '@fontsource-variable/dm-sans'
import '@fontsource/geist-mono/400.css'
import '@fontsource/geist-mono/500.css'
import './styles/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
