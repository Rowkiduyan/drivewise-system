import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// TEMPORARY, dev-only: on-screen console overlay so errors are visible on a
// phone with no cable/remote-debugging setup. Remove once the live-nav
// mobile debugging session is done -- never runs in a production build.
if (import.meta.env.DEV) {
  import('eruda').then((eruda) => eruda.default.init())
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
