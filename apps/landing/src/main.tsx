import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { qurvo } from '@qurvo/sdk-browser'
import App from './App'
import './index.css'

qurvo.init({
  apiKey: 'Ph8DuG6-wpv0BGjGlSYXLLaiWhesHibt',
  endpoint: import.meta.env.VITE_QURVO_ENDPOINT ?? 'https://ingest.qurvo.ru',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
