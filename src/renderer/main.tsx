import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Settings from './Settings'
import { installDemoMock } from './browser/demoMock'
import './styles/index.css'

// No-op under Electron (the preload bridge already exists); installs a browser
// mock + demo chrome when running as a plain web page.
installDemoMock()

// The same renderer bundle serves two windows: the transparent widget overlay
// (default) and the settings window, selected by the URL hash (`#settings`).
const isSettings = window.location.hash.replace(/^#/, '') === 'settings'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>{isSettings ? <Settings /> : <App />}</React.StrictMode>,
)
