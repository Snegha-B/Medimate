import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AccessibilityProvider } from './context/AccessibilityContext'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AccessibilityProvider>
      <App />
    </AccessibilityProvider>
  </StrictMode>,
)
