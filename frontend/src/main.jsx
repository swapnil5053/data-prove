import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

// Order matters and is not alphabetical.
//   tokens      declares the variables everything else reads
//   reset       element defaults, focus baseline, reduced-motion guard
//   typography  @font-face, the scale, numeric behaviour
//   primitives  the shared vocabulary, built on the three above
//   utilities   layout helpers last, so they win over a primitive's own layout
import './styles/tokens.css'
import './styles/reset.css'
import './styles/typography.css'
import './styles/primitives.css'
import './styles/utilities.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
