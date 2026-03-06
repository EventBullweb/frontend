import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { init, isTMA } from '@tma.js/sdk'
import './index.css'
import App from './App.tsx'

if (isTMA()) {
  try {
    init()
  } catch (error) {
    console.error('Не удалось инициализировать Telegram Mini App SDK:', error)
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
