import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installDemoMock } from './browser/demoMock'
import './styles/index.css'

// No-op under Electron (the preload bridge already exists); installs a browser
// mock + demo chrome when running as a plain web page.
installDemoMock()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
