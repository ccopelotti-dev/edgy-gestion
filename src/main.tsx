import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Fase 31b: registro del service worker del PWA (public/sw.js). Solo en
// producción -- en dev (`npm run dev`) el SW puede quedar cacheando
// versiones viejas del bundle y confundir mientras se itera.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // best-effort -- si falla el registro, la app sigue funcionando
      // normal, solo sin instalación offline.
    })
  })
}
