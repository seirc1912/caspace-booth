import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { branding } from './config/branding.ts'
import { BrandingProvider } from './providers/BrandingProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandingProvider branding={branding}>
      <App />
    </BrandingProvider>
  </StrictMode>,
)
