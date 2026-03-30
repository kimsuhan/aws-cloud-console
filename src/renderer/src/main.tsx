import { createRoot } from 'react-dom/client'

import './style.css'
import { App } from './App'

const container = document.querySelector<HTMLDivElement>('#app')

if (!container) {
  throw new Error('Renderer root element was not found.')
}

createRoot(container).render(<App />)
